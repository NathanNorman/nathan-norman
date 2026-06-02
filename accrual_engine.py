#!/Users/nathan.norman/.pyenv/versions/3.12.11/bin/python3
"""
Ridgeline Foods Freight Accrual Engine — April 2026
Estimates April freight charges from shipment data + calibrated rate cards.
"""

import csv
import json
import sys
from datetime import datetime
from collections import defaultdict

BASE = '/Users/nathan.norman/finance-cup'

MARCH_MULTIPLIER = 0.679   # Mar service billed Apr 9; OTRI collapsed post-Liberation Day
OTRI_A = 0.4192
OTRI_B = 1.7914

# ─── CARRIER NORMALIZATION ────────────────────────────────────────────────────

CARRIER_MAP = {
    'PEAK LOGISTICS': 'Peak Logistics',
    'PEAK LOG':       'Peak Logistics',
    'PEAK':           'Peak Logistics',
    'HEARTLAND FREIGHT': 'Heartland Freight',
    'HEARTLAND':         'Heartland Freight',
    'HEARTLAND FREIGHT CO.': 'Heartland Freight',
    'COASTAL EXPRESS':     'Coastal Express',
    'COASTAL':             'Coastal Express',
    'COASTAL EXPRESS LLC': 'Coastal Express',
}

def normalize_carrier(raw):
    return CARRIER_MAP.get(raw.strip().upper(), raw.strip())

# ─── PEAK LOGISTICS ───────────────────────────────────────────────────────────
# Rate: $/mile by weight tier + 14% FSC + accessorials. $185 minimum.
# Mileage: rate card for 5 destinations; remaining derived from invoice history.

PEAK_MILES = {
    # From rate card (carrier-verified)
    'Colorado Springs': 70,
    'Cheyenne':        100,
    'Pocatello':       440,
    'Idaho Falls':     480,
    'Provo':           490,
    'Salt Lake City':  525,
    'Billings':        550,
    'Ogden':           590,
    'Great Falls':     710,
    'Boise':           830,
    'Missoula':        830,
    # Back-calculated from Jan–Mar 2026 invoices (base_charge / rate_per_mile)
    'Fort Collins':  50,
    'Pueblo':        75,
    'Grand Junction': 222,
    'Laramie':       100,
    'Casper':        242,
}

PEAK_RATE_PER_MILE = {
    'lt500':  3.25,
    'lt2000': 4.80,
    'gt2000': 6.40,
}
PEAK_FSC = 0.14
PEAK_MIN = 185.00
PEAK_MIN_EXCEPTIONS = {'Fort Collins'}  # local lane — no minimum observed in history

PEAK_ACC_FEES = {
    'Liftgate':            75.0,
    'Residential Delivery': 45.0,
    'Appointment Delivery': 50.0,
    'Inside Delivery':     125.0,
}

def peak_tier(weight):
    w = float(weight or 0)
    if w < 500:    return 'lt500'
    elif w <= 2000: return 'lt2000'
    else:           return 'gt2000'

def calc_peak(s):
    city   = s['destination_city']
    weight = float(s['weight_lbs'] or 0)
    sh     = s.get('special_handling', '').strip()

    if city not in PEAK_MILES:
        return None, f"No mileage data for {city}, {s['destination_state']}"

    miles = PEAK_MILES[city]
    rate  = PEAK_RATE_PER_MILE[peak_tier(weight)]
    base  = miles * rate
    if city not in PEAK_MIN_EXCEPTIONS:
        base = max(base, PEAK_MIN)

    fsc   = round(base * PEAK_FSC, 2)
    base  = round(base, 2)
    acc   = PEAK_ACC_FEES.get(sh, 0.0)
    total = round(base + fsc + acc, 2)

    method = 'rate_card' if city in {
        'Colorado Springs','Cheyenne','Pocatello','Idaho Falls','Provo',
        'Salt Lake City','Billings','Ogden','Great Falls','Boise','Missoula'
    } else 'invoice_derived'

    return {
        'miles': miles, 'rate_per_mile': rate,
        'base': base, 'fsc': fsc,
        'accessorial': acc, 'accessorial_type': sh or None,
        'total': total, 'method': method,
    }, None

# ─── HEARTLAND FREIGHT ────────────────────────────────────────────────────────
# Rate: flat zone rate (fuel included). Quarterly volume discount tiers reset Apr 1.
# Calibrated Q1/Q2 2026 rates derived from actual invoice history (+22.7% vs card).

# Build ZIP-prefix → zone lookup
HEARTLAND_ZONES = {}
def _build_hz():
    for lo, hi, z in [
        (640,641,'Zone 1'),(660,662,'Zone 1'),
        (663,668,'Zone 2'),(669,679,'Zone 2'),(630,639,'Zone 2'),
        (650,659,'Zone 2'),(500,529,'Zone 2'),(680,685,'Zone 2'),
        (600,609,'Zone 3'),(610,629,'Zone 3'),(530,546,'Zone 3'),(550,554,'Zone 3'),
        (547,549,'Zone 4'),(555,567,'Zone 4'),(686,693,'Zone 4'),
    ]:
        for p in range(lo, hi+1):
            HEARTLAND_ZONES[p] = z
_build_hz()

# Calibrated rates from actual Q1 2026 invoices (NOT the published card)
HEARTLAND_CALIBRATED = {'Zone 1': 393.0, 'Zone 2': 595.0, 'Zone 3': 748.0, 'Zone 4': 957.0}
HEARTLAND_CARD       = {'Zone 1': 320.0, 'Zone 2': 485.0, 'Zone 3': 610.0, 'Zone 4': 780.0}

HEARTLAND_ACC_FEES = {
    'Liftgate':            85.0,
    'Inside Delivery':    135.0,
    'Appointment Delivery': 40.0,
}

def zip_to_zone(zipcode):
    prefix = int(str(zipcode).zfill(5)[:3])
    return HEARTLAND_ZONES.get(prefix)

def calc_heartland(s, qtd_seq):
    zone = zip_to_zone(s['destination_zip'])
    if not zone:
        return None, f"ZIP {s['destination_zip']} not in zone table"

    # Q2 reset Apr 1 → prospective tier discount
    if qtd_seq <= 50:
        tier, discount = 'Tier 1', 0.0
    else:
        tier, discount = 'Tier 2', 0.05

    base_rate = HEARTLAND_CALIBRATED[zone]
    base      = round(base_rate * (1 - discount), 2)
    sh        = s.get('special_handling', '').strip()
    acc       = HEARTLAND_ACC_FEES.get(sh, 0.0)
    total     = round(base + acc, 2)

    return {
        'zone': zone, 'base_rate': base_rate,
        'tier': tier, 'discount': discount, 'qtd_sequence': qtd_seq,
        'base': base,
        'accessorial': acc, 'accessorial_type': sh or None,
        'total': total, 'method': 'calibrated_q2_2026',
    }, None

# ─── COASTAL EXPRESS ──────────────────────────────────────────────────────────
# Rate: per-lb by region + 9.5% FSC + residential surcharge + accessorials.
# Calibrated multiplier: 1.17x (Jan–Mar 2026 invoice trend; $28 min scales too).

COASTAL_PUBLISHED = {'SoCal': 0.48, 'NorCal': 0.55, 'PNW': 0.72}
COASTAL_MULT      = 1.17
COASTAL_MIN       = 28.00
COASTAL_FSC       = 0.095

COASTAL_RESIDENTIAL = {
    'lt50':  12.50,
    'lt500': 35.00,
    'gt500': 65.00,
}
COASTAL_ACC_FEES = {
    'Liftgate':            90.0,
    'Inside Delivery':    110.0,
    'Appointment Delivery': 55.0,
}

def zip_to_region(zipcode):
    z = int(str(zipcode).zfill(5))
    if 90000 <= z <= 92899: return 'SoCal'
    if 93000 <= z <= 96199: return 'NorCal'
    if 97000 <= z <= 99499: return 'PNW'
    return None

def residential_fee(weight):
    w = float(weight or 0)
    if w < 50:    return 12.50, 'lt50'
    elif w <= 500: return 35.00, 'lt500'
    else:          return 65.00, 'gt500'

def calc_coastal(s):
    region = zip_to_region(s['destination_zip'])
    if not region:
        return None, f"ZIP {s['destination_zip']} outside Coastal service territory"

    weight     = float(s['weight_lbs'] or 0)
    eff_rate   = COASTAL_PUBLISHED[region] * COASTAL_MULT
    eff_min    = COASTAL_MIN * COASTAL_MULT
    base       = round(max(weight * eff_rate, eff_min), 2)
    fsc        = round(base * COASTAL_FSC, 2)

    res_flag   = s.get('residential', '').upper() == 'TRUE'
    res_fee    = 0.0
    res_tier   = None
    if res_flag:
        res_fee, res_tier = residential_fee(weight)

    sh  = s.get('special_handling', '').strip()
    acc = COASTAL_ACC_FEES.get(sh, 0.0) if sh != 'Residential Delivery' else 0.0

    total = round(base + fsc + res_fee + acc, 2)

    flag = None
    if res_flag and weight >= 50:
        flag = f"Heavy residential ({weight:.0f} lbs) — ${res_fee:.0f} tier unverified in history"

    return {
        'region': region,
        'published_rate': COASTAL_PUBLISHED[region],
        'eff_rate': round(eff_rate, 4),
        'base': base, 'fsc': fsc,
        'residential': res_flag, 'res_fee': res_fee, 'res_tier': res_tier,
        'accessorial': acc, 'accessorial_type': sh if sh and sh != 'Residential Delivery' else None,
        'total': total, 'method': 'calibrated_1.17x',
        'flag': flag,
    }, None

# ─── DENISE BASELINE (trailing 3-month average of actuals) ────────────────────

def load_denise_baseline(filepath):
    months = {'January 2026', 'February 2026', 'March 2026'}
    buckets = defaultdict(list)
    with open(filepath) as f:
        for row in csv.DictReader(f):
            if row['month'] in months:
                buckets[row['carrier']].append(float(row['actual_invoiced']))
    return {c: round(sum(v)/len(v), 2) for c, v in buckets.items()}

# ─── MAIN ─────────────────────────────────────────────────────────────────────

def run(otri=None):
    shipments = []
    with open(f'{BASE}/shipments_apr2026.csv') as f:
        for row in csv.DictReader(f):
            row['carrier_norm'] = normalize_carrier(row['carrier'])
            shipments.append(row)

    # Sort Heartland by date for sequential QTD tier tracking
    hland = sorted(
        [s for s in shipments if s['carrier_norm'] == 'Heartland Freight'],
        key=lambda x: (x['date'], x['shipment_id'])
    )
    hland_seq = {s['shipment_id']: i+1 for i, s in enumerate(hland)}

    carriers = {
        'Peak Logistics':   {'shipments': [], 'total': 0.0, 'flags': []},
        'Heartland Freight':{'shipments': [], 'total': 0.0, 'flags': []},
        'Coastal Express':  {'shipments': [], 'total': 0.0, 'flags': []},
    }

    for s in shipments:
        c   = s['carrier_norm']
        sid = s['shipment_id']
        row = {
            'shipment_id': sid,
            'date': s['date'],
            'destination': f"{s['destination_city']}, {s['destination_state']}",
            'zip': s['destination_zip'],
            'weight': s['weight_lbs'],
            'units': s['units'],
            'service_level': s['service_level'],
            'raw_carrier': s['carrier'],
        }

        if c == 'Peak Logistics':
            calc, err = calc_peak(s)
        elif c == 'Heartland Freight':
            calc, err = calc_heartland(s, hland_seq[sid])
        elif c == 'Coastal Express':
            calc, err = calc_coastal(s)
        else:
            continue

        if err:
            row.update({'total': 0.0, 'error': err})
            carriers[c]['flags'].append({'shipment_id': sid, 'message': err, 'severity': 'error'})
        else:
            row.update(calc)
            carriers[c]['total'] = round(carriers[c]['total'] + calc['total'], 2)
            if calc.get('flag'):
                carriers[c]['flags'].append({'shipment_id': sid, 'message': calc['flag'], 'severity': 'warning'})

        carriers[c]['shipments'].append(row)

    # Compute April acc_rate for Peak (accessorial / base across all estimated shipments)
    peak_base_sum = sum(
        s.get('base', 0) for s in carriers['Peak Logistics']['shipments']
        if not s.get('error')
    )
    peak_acc_sum = sum(
        s.get('accessorial', 0) for s in carriers['Peak Logistics']['shipments']
        if not s.get('error')
    )
    april_acc_rate = round(peak_acc_sum / peak_base_sum, 6) if peak_base_sum else 0.0

    # If otri provided, recompute Peak total using formula multiplier.
    # otri is in percentage points (e.g. 8.0 means 8%) — the formula uses raw percent, not decimal.
    # Base estimate uses March billing multiplier (conservative; OTRI collapsed Apr 9).
    peak_base_total = carriers['Peak Logistics']['total']
    if otri is not None:
        multiplier = round(OTRI_A + OTRI_B * (april_acc_rate * otri), 4)
        adjusted_peak = round(peak_base_total * (multiplier / MARCH_MULTIPLIER), 2)
    else:
        multiplier = MARCH_MULTIPLIER
        adjusted_peak = peak_base_total

    # Build sensitivity table for OTRI 4%–14% (otri_pct passed as percent points)
    sensitivity = []
    for otri_pct in [4, 6, 8, 10, 12, 14]:
        m = round(OTRI_A + OTRI_B * (april_acc_rate * otri_pct), 4)
        peak_est = round(peak_base_total * (m / MARCH_MULTIPLIER), 2)
        sensitivity.append({
            'otri_pct': otri_pct,
            'multiplier': m,
            'peak_total': peak_est,
        })

    denise = load_denise_baseline(f'{BASE}/denise_accruals_v2.csv')
    # Map Denise's carrier names to our normalized names
    denise_norm = {}
    for raw, val in denise.items():
        norm = normalize_carrier(raw)
        denise_norm[norm] = val

    grand_total  = round(
        adjusted_peak + carriers['Heartland Freight']['total'] + carriers['Coastal Express']['total'], 2
    )
    denise_total = round(sum(denise_norm.values()), 2)

    output = {
        'run_date': datetime.now().isoformat(),
        'service_month': 'April 2026',
        'carriers': carriers,
        'denise_baseline': denise_norm,
        'grand_total': grand_total,
        'denise_total': denise_total,
        'delta_vs_denise': round(grand_total - denise_total, 2),
        'shipment_count': len(shipments),
        'peak_acc_rate': april_acc_rate,
        'peak_multiplier': multiplier,
        'peak_adjusted_total': adjusted_peak,
        'peak_sensitivity': sensitivity,
    }

    return output

if __name__ == '__main__':
    result = run()
    print(json.dumps(result, indent=2))
