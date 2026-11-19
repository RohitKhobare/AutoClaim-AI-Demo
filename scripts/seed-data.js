'use strict';
/**
 * Demo dataset for AutoClaim AI.
 *   node scripts/init-db.js --reset --seed
 *
 * Every seeded account uses the same demo password (default: Auto@123).
 */
const bcrypt = require('bcryptjs');
const mysql = require('mysql2/promise');
const config = require('../src/config');

const INSURER = config.company.insurer;

const customers = [
  {
    name: 'Rohit Khobare', email: 'rohit@autoclaim.ai', phone: '9096809820', city: 'Pune', language: 'en',
    vehicles: [{
      reg: 'MH12AB1234', make: 'Hyundai', model: 'Creta', variant: 'SX (O) 1.5 Diesel', year: 2021,
      fuel: 'diesel', colour: 'Polar White', chassis: 'MEEJ1C1F4MK123456', engine: 'D4FCMK789012', odometer: 48210,
      policy: {
        number: 'POL-2026-1001', type: 'comprehensive', start: '2026-04-12', end: '2027-04-11',
        sum: 1200000, idv: 1080000, premium: 24850, deductible: 1000, ncb: 20, status: 'active',
        addons: ['Zero Depreciation Cover', 'Engine Protect', 'Roadside Assistance'],
      },
    }, {
      reg: 'MH12XY5678', make: 'Honda', model: 'Activa 6G', variant: 'STD', year: 2022,
      fuel: 'petrol', colour: 'Matte Axis Grey', chassis: 'ME4JF50ATP8000123', engine: 'JF50ET8000456', odometer: 12480,
      policy: {
        number: 'POL-2026-1002', type: 'comprehensive', start: '2026-06-01', end: '2027-05-31',
        sum: 78000, idv: 68000, premium: 2180, deductible: 500, ncb: 0, status: 'active',
        addons: ['Personal Accident Cover'],
      },
    }],
  },
  {
    name: 'Vasudha Patil', email: 'vasudha@autoclaim.ai', phone: '9822011001', city: 'Pune', language: 'mr',
    vehicles: [{
      reg: 'MH14CD2211', make: 'Maruti Suzuki', model: 'Swift', variant: 'VXi', year: 2019,
      fuel: 'petrol', colour: 'Silky Silver', chassis: 'MA3EJKD1S00345678', engine: 'K12MN1234567', odometer: 72150,
      policy: {
        number: 'POL-2026-1003', type: 'comprehensive', start: '2026-02-18', end: '2027-02-17',
        sum: 650000, idv: 520000, premium: 13420, deductible: 1000, ncb: 15, status: 'active',
        addons: ['Zero Depreciation Cover'],
      },
    }],
  },
  {
    name: 'Balaji Raparti', email: 'balaji@autoclaim.ai', phone: '9822011002', city: 'Mumbai', language: 'en',
    vehicles: [{
      reg: 'MH02EF9087', make: 'Tata', model: 'Nexon', variant: 'XZ+ Lux', year: 2022,
      fuel: 'petrol', colour: 'Flame Red', chassis: 'MAT626487NPD12345', engine: 'REVTRON1234567', odometer: 33480,
      policy: {
        number: 'POL-2026-1004', type: 'comprehensive', start: '2026-08-09', end: '2027-08-08',
        sum: 1100000, idv: 980000, premium: 19870, deductible: 1000, ncb: 0, status: 'active',
        addons: ['Zero Depreciation Cover', 'Consumables Cover'],
      },
    }],
  },
  {
    name: 'Amogh Waskar', email: 'amogh@autoclaim.ai', phone: '9822011003', city: 'Nashik', language: 'mr',
    vehicles: [{
      reg: 'MH15GH4432', make: 'Bajaj', model: 'Pulsar 150', variant: 'Neon', year: 2021,
      fuel: 'petrol', colour: 'Black', chassis: 'MD2A1120XMC123456', engine: 'DHZWMX12345', odometer: 51200,
      policy: {
        number: 'POL-2026-1005', type: 'third_party', start: '2026-05-10', end: '2027-05-09',
        sum: 0, idv: 0, premium: 1440, deductible: 0, ncb: 0, status: 'active',
        addons: [],
      },
    }],
  },
  {
    name: 'Jignesh Patil', email: 'jignesh@autoclaim.ai', phone: '9822011004', city: 'Kolhapur', language: 'mr',
    vehicles: [{
      reg: 'MH09IJ7755', make: 'Maruti Suzuki', model: 'Ertiga', variant: 'ZXi CNG', year: 2020,
      fuel: 'cng', colour: 'Pearl Arctic White', chassis: 'MA3ERLD1S00123456', engine: 'K15BC1234567', odometer: 68400,
      policy: {
        number: 'POL-2025-0912', type: 'comprehensive', start: '2025-03-01', end: '2026-02-28',
        sum: 950000, idv: 780000, premium: 18650, deductible: 1000, ncb: 0, status: 'expired',
        addons: [],
      },
    }],
  },
  {
    name: 'Sneha Deshmukh', email: 'sneha@autoclaim.ai', phone: '9822011005', city: 'Pune', language: 'mr',
    vehicles: [{
      reg: 'MH12KL3322', make: 'Hyundai', model: 'i20', variant: 'Asta (O)', year: 2023,
      fuel: 'petrol', colour: 'Titan Grey', chassis: 'MALBB51CLPM123456', engine: 'G3LC1234567', odometer: 21400,
      policy: {
        number: 'POL-2026-1006', type: 'comprehensive', start: '2026-01-22', end: '2027-01-21',
        sum: 1000000, idv: 920000, premium: 17980, deductible: 1000, ncb: 0, status: 'active',
        addons: ['Zero Depreciation Cover', 'Return to Invoice'],
      },
    }],
  },
  {
    name: 'Imran Shaikh', email: 'imran@autoclaim.ai', phone: '9822011006', city: 'Aurangabad', language: 'hi',
    vehicles: [{
      reg: 'MH20MN8899', make: 'Mahindra', model: 'XUV700', variant: 'AX7 L Diesel', year: 2022,
      fuel: 'diesel', colour: 'Everest White', chassis: 'MA1TA2YS7N2123456', engine: 'MHWK2123456', odometer: 44820,
      policy: {
        number: 'POL-2026-1007', type: 'comprehensive', start: '2026-07-15', end: '2027-07-14',
        sum: 2400000, idv: 2180000, premium: 32450, deductible: 2000, ncb: 0, status: 'active',
        addons: ['Zero Depreciation Cover', 'Engine Protect', 'Consumables Cover'],
      },
    }],
  },
  {
    name: 'Priya Kulkarni', email: 'priya@autoclaim.ai', phone: '9822011007', city: 'Satara', language: 'mr',
    vehicles: [{
      reg: 'MH11OP1122', make: 'TVS', model: 'Jupiter', variant: 'ZX', year: 2020,
      fuel: 'petrol', colour: 'Titanium Grey', chassis: 'MD625GF56L1A12345', engine: 'GF56L12345', odometer: 28950,
      policy: {
        number: 'POL-2026-1008', type: 'comprehensive', start: '2026-09-03', end: '2027-09-02',
        sum: 72000, idv: 58000, premium: 1980, deductible: 500, ncb: 0, status: 'active',
        addons: [],
      },
    }],
  },
  {
    name: 'Anjali Rane', email: 'anjali@autoclaim.ai', phone: '9822011008', city: 'Thane', language: 'en',
    vehicles: [{
      reg: 'MH04QR5566', make: 'Kia', model: 'Seltos', variant: 'HTX 1.5 Petrol', year: 2023,
      fuel: 'petrol', colour: 'Intense Red', chassis: 'MZBET81CBPM123456', engine: 'G4FLPM123456', odometer: 19800,
      policy: {
        number: 'POL-2026-1009', type: 'comprehensive', start: '2026-10-05', end: '2027-10-04',
        sum: 1600000, idv: 1480000, premium: 26780, deductible: 1000, ncb: 0, status: 'active',
        addons: ['Zero Depreciation Cover', 'Roadside Assistance'],
      },
    }],
  },
  {
    name: 'Suresh More', email: 'suresh@autoclaim.ai', phone: '9822011009', city: 'Pune', language: 'en',
    vehicles: [{
      reg: 'MH12ST7788', make: 'Toyota', model: 'Innova Crysta', variant: 'GX 7-Seater', year: 2018,
      fuel: 'diesel', colour: 'Silver Metallic', chassis: 'MBJ11JV4001234567', engine: '2GD1234567', odometer: 142300,
      policy: {
        number: 'POL-2026-1010', type: 'comprehensive', start: '2026-11-01', end: '2027-10-31',
        sum: 1300000, idv: 960000, premium: 23100, deductible: 2000, ncb: 25, status: 'active',
        addons: [],
      },
    }],
  },
];

const admins = [
  { name: 'Rohit Khobare', email: 'admin@autoclaim.ai', phone: '9096809820', city: 'Pune' },
  { name: 'Neha Joshi', email: 'adjuster@autoclaim.ai', phone: '9822012001', city: 'Pune' },
];

/* ── Clause library, generated per policy ───────────────────────── */
function clausesFor(policy, vehicle) {
  const base = [
    ['2.1', 'Scope of cover', `This policy covers loss or damage to the insured vehicle ${vehicle.make} ${vehicle.model} (${vehicle.reg}) caused by accident, collision, overturning, external means, fire, self-ignition, lightning, riot and strike, malicious act, flood, typhoon, hurricane, storm, tempest, landslide, rockslide, earthquake or other natural calamity.`, 'coverage'],
    ['2.2', 'Third-party liability', 'The company shall indemnify the insured against legal liability for death, bodily injury or damage to property of a third party arising out of the use of the insured vehicle in a public place, up to the limits prescribed under the Motor Vehicles Act, 1988.', 'coverage'],
    ['3.1', 'Total loss and constructive total loss', 'Where the aggregate cost of repair exceeds 75% of the Insured Declared Value (IDV), the claim shall be settled on a total-loss basis at the IDV less the applicable deductible and salvage value.', 'coverage'],
    ['4.2.1', 'Own damage — accident', 'Accidental damage to the insured vehicle, including damage to the front bumper, headlamps, bonnet, doors, side panels, glass and body panels, is payable subject tosurvey and the applicable deductible, provided the incident is reported within 48 hours as required by Clause 6.1.', 'coverage'],
    ['4.2.2', 'Own damage — natural calamity', 'Damage caused by flood, inundation, cyclone, hailstorm, earthquake or landslide is payable where the vehicle was not driven into a flooded area with knowledge of the risk and the incident is supported by an official weather or authority report.', 'coverage'],
    ['5.1', 'Exclusions — general', 'The company shall not be liable for: (a) consequential loss of any kind; (b) wear and tear, mechanical or electrical breakdown, failure or breakage; (c) damage while the vehicle is used otherwise than in accordance with the limitations as to use; (d) damage arising from driving by a person without a valid driving licence; (e) damage arising out of intoxication or use of intoxicating liquor or drugs.', 'exclusion'],
    ['5.4', 'Exclusions — pre-existing and unreported damage', 'Damage that existed prior to the commencement of this policy, or damage that was not reported within the intimation period, is not payable. Claims are subject to photographic evidence captured at the time of the incident.', 'exclusion'],
    ['6.1', 'Claim intimation', 'The insured shall give immediate notice of any accident, and in any event within 48 hours, to the company quoting the policy number and registration number of the vehicle, together with photographs of the damage and a copy of the FIR where one is required.', 'condition'],
    ['6.3', 'Documents required', 'A claim must be supported by the completed claim form, copy of the RC book, valid driving licence, copy of the policy, photographs of the accident, and the FIR where the claim arises from theft, third-party injury or a hit-and-run incident.', 'claim_process'],
    ['7.2', 'Deductible', `Each and every claim under Section I is subject to a compulsory deductible of ₹ ${Number(policy.deductible).toLocaleString('en-IN')}. Any voluntary deductible opted by the insured is in addition to this amount.`, 'deductible'],
    ['8.5', 'Repair and cashless facility', 'Repairs shall be carried out at a network garage for cashless settlement. Where repairs are carried out at a non-network garage, reimbursement is limited to the assessed repair cost less the deductible and is paid on production of the original invoice and payment receipt.', 'claim_process'],
  ];
  if (policy.type === 'third_party') {
    return [
      ['1.1', 'Policy type — Liability only', 'This is a Liability Only (Third Party) policy. It covers the insured\'s legal liability towards third parties only. Damage to the insured vehicle itself is expressly outside the scope of this policy.', 'exclusion'],
      ...base.filter((c) => ['2.2', '5.1', '6.1', '6.3'].includes(c[0])),
      ['9.1', 'Optional own-damage cover', 'Own damage cover for the insured vehicle may be purchased separately as a Comprehensive or Own Damage policy. Any request to convert this policy must be made before the incident date.', 'condition'],
    ];
  }
  return base;
}

const CLAIM_IMAGES = {
  scratch: { types: [['Scratch', 0.9], ['Dent', 0.86]], severity: 'minor' },
  bumper: { types: [['Bumper Damage', 0.96], ['Scratch', 0.9]], severity: 'moderate' },
  front: { types: [['Broken Headlight', 0.94], ['Dent', 0.92], ['Bumper Damage', 0.96], ['Scratch', 0.9]], severity: 'major' },
  glass: { types: [['Broken Glass', 0.88], ['Bumper Damage', 0.72]], severity: 'moderate' },
  side: { types: [['Dent', 0.93], ['Scratch', 0.88]], severity: 'major' },
};

const claims = [
  {
    number: 'CLM-2026-0001', customer: 'rohit@autoclaim.ai', reg: 'MH12AB1234', type: 'own_damage',
    date: '2026-10-04', time: '18:42:00', location: 'Pune–Mumbai Expressway, near Talegaon toll plaza',
    description: 'Rear-ended by a truck while braking in slow-moving traffic. Front bumper, headlamp and bonnet damaged. No injuries. Other driver stopped and exchanged details.',
    fir: 'FIR-PN-2026-8841', reported: 84500, status: 'paid', ai_status: 'completed',
    aiImageProb: 3.2, verdict: 'real', detected: ['Hyundai', 'Creta', 2021], match: 98.6,
    images: [['front', 2.8, 'front'], ['closeup', 3.6, 'bumper'], ['left', 3.0, 'side'], ['front', 3.4, 'front']],
    damages: [['Broken Headlight', 0.94], ['Dent', 0.92], ['Bumper Damage', 0.96], ['Scratch', 0.9], ['Broken Glass', 0.88]],
    severity: 'major', severityScore: 0.78, cost: 84500,
    breakdown: [['Parts Cost', 54000], ['Labour Cost', 18000], ['Painting Cost', 8500], ['Other Charges', 4000]],
    fraud: 0.08, risk: 'low', recommendation: 'auto_approve', confidence: 94.6,
    coverage: [1, '4.2.1', 93.0], approved: 83500, decidedBy: 'admin@autoclaim.ai', decidedAt: '2026-10-05 11:12:00',
    notes: 'AI verification passed. Repair invoice verified from network garage. Amount settled after compulsory deductible of ₹1,000.',
    docs: ['rc_book', 'driving_license', 'policy_copy', 'fir', 'claim_form'],
    payment: { amount: 83500, status: 'paid', method: 'upi', paidAt: '2026-10-06 15:25:00', orderId: 'order_RZP_9F2A71C4D8' },
    createdAt: '2026-10-04 19:10:00', endedAt: '2026-10-06 15:25:00',
  },
  {
    number: 'CLM-2026-0002', customer: 'vasudha@autoclaim.ai', reg: 'MH14CD2211', type: 'own_damage',
    date: '2026-10-19', time: '09:15:00', location: 'Karve Road, opposite Nal Stop, Pune',
    description: 'Scratches and dent on the rear bumper while reversing out of a parking space. Hit a boundary wall.',
    fir: null, reported: 21800, status: 'manual_review', ai_status: 'completed',
    aiImageProb: 9.4, verdict: 'real', detected: ['Maruti Suzuki', 'Swift', 2019], match: 96.2,
    images: [['rear', 8.6, 'bumper'], ['closeup', 9.9, 'scratch'], ['right', 9.1, 'scratch']],
    damages: [['Bumper Damage', 0.91], ['Dent', 0.89], ['Scratch', 0.93]],
    severity: 'moderate', severityScore: 0.52, cost: 21800,
    breakdown: [['Parts Cost', 11500], ['Labour Cost', 6200], ['Painting Cost', 3100], ['Other Charges', 1000]],
    fraud: 0.34, risk: 'medium', recommendation: 'manual_review', confidence: 71.4,
    coverage: [1, '4.2.1', 88.5], approved: null, decidedBy: null, decidedAt: null, notes: null,
    docs: ['rc_book', 'driving_license', 'policy_copy', 'claim_form'],
    payment: null, createdAt: '2026-10-19 10:02:00', endedAt: null,
  },
  {
    number: 'CLM-2026-0003', customer: 'amogh@autoclaim.ai', reg: 'MH15GH4432', type: 'own_damage',
    date: '2026-10-22', time: '20:05:00', location: 'Gangapur Road, Nashik',
    description: 'Bike skidded and fell on the left side after hitting loose gravel. Fuel tank and leg guard damaged.',
    fir: null, reported: 9600, status: 'rejected', ai_status: 'completed',
    aiImageProb: 4.1, verdict: 'real', detected: ['Bajaj', 'Pulsar 150', 2021], match: 95.4,
    images: [['left', 4.4, 'side'], ['closeup', 3.8, 'scratch']],
    damages: [['Dent', 0.9], ['Scratch', 0.87]],
    severity: 'minor', severityScore: 0.31, cost: 9600,
    breakdown: [['Parts Cost', 5600], ['Labour Cost', 2600], ['Painting Cost', 1200], ['Other Charges', 200]],
    fraud: 0.12, risk: 'low', recommendation: 'reject', confidence: 97.2,
    coverage: [0, '1.1', 97.2], approved: null, decidedBy: 'admin@autoclaim.ai', decidedAt: '2026-10-23 12:30:00',
    notes: 'Policy POL-2026-1005 is a third-party liability only policy. Own damage is outside the scope of cover, as stated in Clause 1.1. Claim rejected and customer informed.',
    docs: ['rc_book', 'driving_license', 'policy_copy', 'claim_form'],
    payment: null, createdAt: '2026-10-22 20:41:00', endedAt: '2026-10-23 12:30:00',
  },
  {
    number: 'CLM-2026-0004', customer: 'sneha@autoclaim.ai', reg: 'MH12KL3322', type: 'own_damage',
    date: '2026-11-02', time: '13:20:00', location: 'Baner Road, near Pashan junction, Pune',
    description: 'Front-left corner hit a divider while avoiding a two-wheeler. Bumper cracked, headlight bracket broken.',
    fir: null, reported: 41200, status: 'manual_review', ai_status: 'completed',
    aiImageProb: 68.4, verdict: 'ai_generated', detected: ['Hyundai', 'i20', 2023], match: 91.8,
    images: [['front', 71.2, 'front'], ['closeup', 64.8, 'bumper'], ['left', 69.1, 'side']],
    damages: [['Bumper Damage', 0.88], ['Broken Headlight', 0.81], ['Dent', 0.77]],
    severity: 'moderate', severityScore: 0.57, cost: 41200,
    breakdown: [['Parts Cost', 27400], ['Labour Cost', 8400], ['Painting Cost', 4400], ['Other Charges', 1000]],
    fraud: 0.72, risk: 'high', recommendation: 'fraud_suspected', confidence: 58.3,
    coverage: [1, '4.2.1', 90.1], approved: null, decidedBy: null, decidedAt: null, notes: null,
    docs: ['rc_book', 'driving_license', 'policy_copy', 'claim_form'],
    payment: null, createdAt: '2026-11-02 14:05:00', endedAt: null,
  },
  {
    number: 'CLM-2026-0005', customer: 'jignesh@autoclaim.ai', reg: 'MH09IJ7755', type: 'own_damage',
    date: '2026-09-24', time: '07:50:00', location: 'NH-48, near Kagal bypass, Kolhapur',
    description: 'Vehicle hit a pothole and the front suspension and bumper were damaged.',
    fir: null, reported: 38400, status: 'rejected', ai_status: 'completed',
    aiImageProb: 5.6, verdict: 'real', detected: ['Maruti Suzuki', 'Ertiga', 2020], match: 94.1,
    images: [['front', 5.2, 'bumper'], ['closeup', 6.1, 'bumper']],
    damages: [['Bumper Damage', 0.9], ['Dent', 0.74]],
    severity: 'moderate', severityScore: 0.48, cost: 38400,
    breakdown: [['Parts Cost', 24000], ['Labour Cost', 8000], ['Painting Cost', 5400], ['Other Charges', 1000]],
    fraud: 0.19, risk: 'low', recommendation: 'reject', confidence: 96.0,
    coverage: [0, '6.1', 95.2], approved: null, decidedBy: 'adjuster@autoclaim.ai', decidedAt: '2026-09-25 10:15:00',
    notes: 'Policy expired on 28-Feb-2026; incident occurred on 24-Sep-2026 after a lapse of cover. No active policy in force on the incident date.',
    docs: ['rc_book', 'driving_license', 'claim_form'],
    payment: null, createdAt: '2026-09-24 08:30:00', endedAt: '2026-09-25 10:15:00',
  },
  {
    number: 'CLM-2026-0006', customer: 'imran@autoclaim.ai', reg: 'MH20MN8899', type: 'own_damage',
    date: '2026-11-09', time: '21:35:00', location: 'Jalna Road, near CIDCO bus stand, Aurangabad',
    description: 'Hailstorm caused multiple dents on the bonnet, roof and right-side doors. No glass damage.',
    fir: null, reported: 132000, status: 'approved', ai_status: 'completed',
    aiImageProb: 6.8, verdict: 'real', detected: ['Mahindra', 'XUV700', 2022], match: 97.4,
    images: [['front', 6.2, 'front'], ['right', 7.1, 'side'], ['rear', 6.9, 'side'], ['closeup', 6.4, 'scratch']],
    damages: [['Dent', 0.95], ['Scratch', 0.86], ['Bumper Damage', 0.72]],
    severity: 'major', severityScore: 0.81, cost: 132000,
    breakdown: [['Parts Cost', 68000], ['Labour Cost', 34000], ['Painting Cost', 26000], ['Other Charges', 4000]],
    fraud: 0.11, risk: 'low', recommendation: 'auto_approve', confidence: 92.8,
    coverage: [1, '4.2.2', 91.6], approved: 130000, decidedBy: 'admin@autoclaim.ai', decidedAt: '2026-11-10 16:40:00',
    notes: 'Approved under natural calamity cover, Clause 4.2.2. IMD hailstorm advisory for Aurangabad district on 09-Nov-2026 verified. Settlement pending.',
    docs: ['rc_book', 'driving_license', 'policy_copy', 'claim_form'],
    payment: null, createdAt: '2026-11-09 22:05:00', endedAt: '2026-11-10 16:40:00',
  },
  {
    number: 'CLM-2026-0007', customer: 'priya@autoclaim.ai', reg: 'MH11OP1122', type: 'own_damage',
    date: '2026-11-14', time: '17:25:00', location: 'Powai Naka, Satara',
    description: 'Scooter was hit from behind by a cyclist. Rear panels and grab rail scratched, indicator broken.',
    fir: null, reported: 4800, status: 'manual_review', ai_status: 'completed',
    aiImageProb: 12.2, verdict: 'real', detected: ['TVS', 'Jupiter', 2020], match: 90.2,
    images: [['rear', 11.4, 'scratch'], ['closeup', 13.0, 'scratch']],
    damages: [['Scratch', 0.89], ['Dent', 0.72]],
    severity: 'minor', severityScore: 0.26, cost: 4800,
    breakdown: [['Parts Cost', 2600], ['Labour Cost', 1200], ['Painting Cost', 900], ['Other Charges', 100]],
    fraud: 0.26, risk: 'medium', recommendation: 'manual_review', confidence: 76.1,
    coverage: [1, '4.2.1', 86.4], approved: null, decidedBy: null, decidedAt: null, notes: null,
    docs: ['rc_book', 'driving_license', 'policy_copy', 'claim_form'],
    payment: null, createdAt: '2026-11-14 18:00:00', endedAt: null,
  },
  {
    number: 'CLM-2026-0008', customer: 'balaji@autoclaim.ai', reg: 'MH02EF9087', type: 'own_damage',
    date: '2026-11-16', time: '11:10:00', location: 'Eastern Express Highway, Vikhroli, Mumbai',
    description: 'Side-swiped by an auto-rickshaw changing lanes. Right doors dented and scratched, mirror broken.',
    fir: null, reported: 58600, status: 'ai_review', ai_status: 'pending',
    aiImageProb: null, verdict: null, detected: null, match: null,
    images: [], damages: [], severity: null, severityScore: null, cost: null, breakdown: [],
    fraud: null, risk: null, recommendation: null, confidence: null, coverage: [null, null, null],
    approved: null, decidedBy: null, decidedAt: null, notes: null,
    docs: ['rc_book', 'driving_license', 'claim_form'],
    payment: null, createdAt: '2026-11-16 11:45:00', endedAt: null,
  },
  {
    number: 'CLM-2026-0009', customer: 'anjali@autoclaim.ai', reg: 'MH04QR5566', type: 'own_damage',
    date: '2026-11-17', time: '19:05:00', location: 'Ghodbunder Road, Thane West',
    description: 'Windscreen cracked by a stone thrown up by a truck. No other damage.',
    fir: null, reported: 14500, status: 'submitted', ai_status: 'pending',
    aiImageProb: null, verdict: null, detected: null, match: null,
    images: [], damages: [], severity: null, severityScore: null, cost: null, breakdown: [],
    fraud: null, risk: null, recommendation: null, confidence: null, coverage: [null, null, null],
    approved: null, decidedBy: null, decidedAt: null, notes: null,
    docs: ['rc_book', 'driving_license', 'policy_copy'],
    payment: null, createdAt: '2026-11-17 19:30:00', endedAt: null,
  },
];

const fraudSignalSets = {
  low: [
    { key: 'doc_match', label: 'Documents match policy records', weight: 0.02, severity: 'info' },
    { key: 'image_authentic', label: 'Accident images verified authentic', weight: 0.03, severity: 'info' },
    { key: 'amount_vs_idv', label: 'Claim amount within expected repair range', weight: 0.03, severity: 'info' },
  ],
  medium: [
    { key: 'doc_mismatch', label: 'RC copy partially unreadable — fields manually confirmed', weight: 0.14, severity: 'medium' },
    { key: 'amount_vs_idv', label: 'Claim amount near upper band for damage type', weight: 0.12, severity: 'medium' },
    { key: 'repeat_garage', label: 'Repair garage appears in 2 unrelated claims', weight: 0.08, severity: 'medium' },
  ],
  high: [
    { key: 'image_ai', label: 'AI-generated content detected in 2 of 3 images', weight: 0.34, severity: 'high' },
    { key: 'amount_vs_idv', label: 'Claim amount 21% above benchmark repair cost', weight: 0.18, severity: 'high' },
    { key: 'late_intimation', label: 'Claim reported 9 hours after incident with no FIR', weight: 0.12, severity: 'medium' },
    { key: 'metadata', label: 'Image EXIF timestamps inconsistent with incident time', weight: 0.08, severity: 'medium' },
  ],
};

function recordFor(c) {
  const covered = c.coverage?.[0];
  const rec = c.recommendation || 'manual_review';
  const summaryMap = {
    auto_approve: `All automated checks passed for ${c.number}. Documents were extracted and matched against policy records, accident images were verified as authentic, and the detected damage is consistent with the reported incident. The claim qualifies for straight-through processing.`,
    manual_review: `${c.number} requires adjuster review. Automated checks raised ${c.risk} risk signals that fall below the auto-approval threshold, although no conclusive fraud indicator was found. A manual inspection of the uploaded images and documents is recommended.`,
    fraud_suspected: `${c.number} shows indicators of manipulated evidence. The AI-image detector flagged a high probability of generated or edited content, and the risk engine raised ${c.risk} risk. The claim must not be auto-settled.`,
    reject: `${c.number} cannot be settled under the linked policy. The policy coverage agent determined that the reported damage is outside the scope of cover${c.coverage?.[1] ? ` (Clause ${c.coverage[1]})` : ''}.`,
  };
  return {
    summary: summaryMap[rec],
    recommendation: rec,
    confidence: c.confidence,
    key_signals: [
      { label: 'Image authenticity', value: c.aiImageProb === null ? 'Not run' : `${(100 - c.aiImageProb).toFixed(1)}% authentic`, impact: c.aiImageProb > 40 ? 'negative' : 'positive' },
      { label: 'Policy coverage', value: covered === null || covered === undefined ? 'Not run' : covered ? `Covered — Clause ${c.coverage[1]}` : `Not covered — Clause ${c.coverage[1]}`, impact: covered ? 'positive' : 'negative' },
      { label: 'Fraud risk score', value: c.fraud === null ? 'Not run' : `${(c.fraud * 100).toFixed(0)} / 100 (${c.risk})`, impact: c.fraud > 0.45 ? 'negative' : 'positive' },
      { label: 'Vehicle match', value: c.match === null ? 'Not run' : `${c.detected.join(' ')} · ${c.match}%`, impact: 'positive' },
      { label: 'Estimated repair cost', value: c.cost === null ? 'Not run' : `₹ ${c.cost.toLocaleString('en-IN')}`, impact: 'neutral' },
    ],
  };
}

async function seedDatabase({ fresh = true } = {}) {
  const conn = await mysql.createConnection({
    host: config.db.host, port: config.db.port, user: config.db.user,
    password: config.db.password, database: config.db.database,
    ...(config.db.ssl ? { ssl: {} } : {}),
    multipleStatements: true, dateStrings: true,
  });

  console.log('→ Seeding demo data...');
  const [[{ userCount }]] = await conn.query('SELECT COUNT(*) AS userCount FROM users');
  if (!fresh && userCount > 0) {
    console.log('→ Demo data already exists; leaving it unchanged.');
    await conn.end();
    return;
  }

  await conn.query('SET FOREIGN_KEY_CHECKS = 0');
  for (const t of ['audit_logs', 'notifications', 'contact_messages', 'ticket_messages', 'support_tickets',
    'payments', 'claim_images', 'claim_documents', 'claims', 'policy_clauses', 'policies', 'vehicles',
    'users', 'settings']) {
    await conn.query(`DELETE FROM \`${t}\``);
  }
  await conn.query('SET FOREIGN_KEY_CHECKS = 1');

  const hash = bcrypt.hashSync(config.demoPassword, 10);
  const adminHash = bcrypt.hashSync(config.adminDemoPassword, 10);
  const userIds = {};
  const vehicleIds = {};
  const policyIds = {};

  for (const c of customers) {
    const [u] = await conn.query(
      'INSERT INTO users (full_name,email,phone,password_hash,role,city,state,language) VALUES (?,?,?,?,?,?,?,?)',
      [c.name, c.email, c.phone, hash, 'user', c.city, 'Maharashtra', c.language || 'en']
    );
    userIds[c.email] = u.insertId;
    for (const v of c.vehicles) {
      const [vr] = await conn.query(
        `INSERT INTO vehicles (user_id,registration_no,make,model,variant,year,fuel_type,colour,chassis_no,engine_no,odometer_km)
         VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
        [u.insertId, v.reg, v.make, v.model, v.variant, v.year, v.fuel, v.colour, v.chassis, v.engine, v.odometer]
      );
      vehicleIds[v.reg] = vr.insertId;
      const p = v.policy;
      const [pr] = await conn.query(
        `INSERT INTO policies (policy_number,user_id,vehicle_id,insurer,policy_type,start_date,end_date,sum_insured,idv,premium,deductible,ncb_percent,addons,status)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
        [p.number, u.insertId, vr.insertId, INSURER, p.type, p.start, p.end, p.sum, p.idv, p.premium,
          p.deductible, p.ncb, JSON.stringify(p.addons || []), p.status]
      );
      policyIds[v.reg] = pr.insertId;
      for (const [no, title, body, cat] of clausesFor(p, v)) {
        await conn.query(
          'INSERT INTO policy_clauses (policy_id,clause_no,title,body,category) VALUES (?,?,?,?,?)',
          [pr.insertId, no, title, body, cat]
        );
      }
    }
  }

  for (const a of admins) {
    const [u] = await conn.query(
      'INSERT INTO users (full_name,email,phone,password_hash,role,city,state,language) VALUES (?,?,?,?,?,?,?,?)',
      [a.name, a.email, a.phone, adminHash, 'admin', a.city, 'Maharashtra', 'en']
    );
    userIds[a.email] = u.insertId;
  }

  const claimIds = {};
  for (const c of claims) {
    const userId = userIds[c.customer];
    const vehicleId = vehicleIds[c.reg];
    const policyId = policyIds[c.reg];
    const docsVerified = c.ai_status === 'completed' ? 1 : 0;
    const ocr = c.ai_status === 'completed' ? {
      fields: [
        { key: 'policy_number', label: 'Policy Number', value: 'POL-verified', matched: true },
        { key: 'vehicle_number', label: 'Vehicle Number', value: c.reg, matched: true },
        { key: 'owner_name', label: 'Owner Name', value: c.customer.split('@')[0], matched: true },
      ],
    } : null;

    const [r] = await conn.query(
      `INSERT INTO claims (claim_number,user_id,vehicle_id,policy_id,claim_type,incident_date,incident_time,location,description,
        fir_number,reported_amount,status,ai_status,ai_image_probability,ai_image_verdict,detected_make,detected_model,detected_year,
        vehicle_match,ocr_fields,ocr_verified,damage_summary,severity,severity_score,repair_cost,cost_breakdown,fraud_score,risk_level,
        fraud_signals,coverage_covered,coverage_clause,coverage_confidence,ai_recommendation,ai_confidence,processing_ms,decision_record,
        approved_amount,decided_by,decided_at,decision_notes,created_at,updated_at)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      [
        c.number, userId, vehicleId, policyId, c.type, c.date, c.time, c.location, c.description, c.fir,
        c.reported, c.status, c.ai_status, c.aiImageProb, c.verdict,
        c.detected ? c.detected[0] : null, c.detected ? c.detected[1] : null, c.detected ? c.detected[2] : null,
        c.match, ocr ? JSON.stringify(ocr) : null, c.ai_status === 'completed' ? docsVerified : null,
        JSON.stringify(c.damages.map(([type, conf]) => ({ type, confidence: conf }))),
        c.severity, c.severityScore, c.cost,
        JSON.stringify(c.breakdown.map(([label, amount]) => ({ label, amount }))),
        c.fraud, c.risk, JSON.stringify(fraudSignalSets[c.risk] || []),
        c.coverage[0], c.coverage[1], c.coverage[2], c.recommendation, c.confidence,
        3200 + Math.round(c.reported / 40), JSON.stringify(recordFor(c)),
        c.approved, c.decidedBy ? userIds[c.decidedBy] : null, c.decidedAt, c.notes,
        c.createdAt, c.endedAt || c.createdAt,
      ]
    );
    claimIds[c.number] = r.insertId;

    const angles = c.images;
    for (let i = 0; i < angles.length; i += 1) {
      const [angle, prob, dmgKey] = angles[i];
      const types = (CLAIM_IMAGES[dmgKey] || CLAIM_IMAGES.bumper).types;
      await conn.query(
        `INSERT INTO claim_images (claim_id,angle,original_name,stored_name,mime_type,size_bytes,ai_probability,is_ai_generated,damage_types,uploaded_at)
         VALUES (?,?,?,?,?,?,?,?,?,?)`,
        [claimId(c.number), angle, `${angle}-accident-${i + 1}.jpg`, '', 'image/jpeg', 1480000 + i * 42000,
          prob, prob > 40 ? 1 : 0, JSON.stringify(types.map(([type, conf]) => ({ type, confidence: conf }))), c.createdAt]
      );
    }
    for (const docType of c.docs) {
      await conn.query(
        `INSERT INTO claim_documents (claim_id,doc_type,original_name,stored_name,mime_type,size_bytes,ocr_fields,verified,checks,uploaded_at)
         VALUES (?,?,?,?,?,?,?,?,?,?)`,
        [claimId(c.number), docType, `${docType.replace(/_/g, '-')}.pdf`, '', 'application/pdf', 284000,
          JSON.stringify({ extracted: true, confidence: 90 + Math.round(Math.random() * 8) }),
          c.ai_status === 'completed' ? 1 : null,
          JSON.stringify([
            { label: 'Document type detected', pass: true },
            { label: 'Fields cross-verified with policy record', pass: true },
            { label: 'No tampering indicators', pass: c.risk !== 'high' },
          ]),
          c.createdAt]
      );
    }

    if (c.payment) {
      await conn.query(
        `INSERT INTO payments (claim_id,user_id,gateway,order_id,payment_id,amount,currency,method,status,receipt,created_at,paid_at)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`,
        [claimId(c.number), userId, 'razorpay', c.payment.orderId, `pay_RZP_${c.payment.orderId.slice(-8)}`,
          c.payment.amount, 'INR', c.payment.method, c.payment.status, `rcpt_${c.number}`, c.createdAt, c.payment.paidAt]
      );
    }
  }

  function claimId(num) {
    return claimIds[num];
  }

  // Support tickets
  const tickets = [
    {
      user: 'rohit@autoclaim.ai', subject: 'Settlement credit not reflected in bank account',
      category: 'payment', priority: 'high', status: 'resolved',
      messages: [
        ['user', 'Rohit Khobare', 'My claim CLM-2026-0001 was approved and shows as paid, but the amount has not reached my account yet. Please check.'],
        ['admin', 'Neha Joshi', 'Thank you for reaching out. The NEFT reference for ₹83,500 was generated on 06-Oct and usually credits within 24 working hours. We have attached the UTR to your claim timeline.'],
        ['user', 'Rohit Khobare', 'Received now. Thank you for the quick response!'],
      ],
    },
    {
      user: 'vasudha@autoclaim.ai', subject: 'Need help with additional photos for claim CLM-2026-0002',
      category: 'claim', priority: 'normal', status: 'in_progress',
      messages: [
        ['user', 'Vasudha Patil', 'The claim is in manual review. Which additional photos should I upload for the rear bumper damage?'],
        ['admin', 'Neha Joshi', 'Please upload two close-up photos in daylight showing the dent depth, plus one wide photo of the full rear of the car. You can add them from the claim page.'],
      ],
    },
    {
      user: 'priya@autoclaim.ai', subject: 'How do I add a zero-depreciation add-on?',
      category: 'policy', priority: 'low', status: 'open',
      messages: [
        ['user', 'Priya Kulkarni', 'My scooter policy does not have zero depreciation. Can I add it mid-term and will it apply to my current claim?'],
      ],
    },
  ];
  let ticketSeq = 4820;
  for (const t of tickets) {
    const [tr] = await conn.query(
      'INSERT INTO support_tickets (ticket_no,user_id,subject,category,priority,status,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?)',
      [`TKT-${++ticketSeq}`, userIds[t.user], t.subject, t.category, t.priority, t.status, '2026-11-05 10:20:00', '2026-11-07 16:40:00']
    );
    for (const [role, name, msg] of t.messages) {
      await conn.query(
        'INSERT INTO ticket_messages (ticket_id,sender_role,sender_name,message,created_at) VALUES (?,?,?,?,?)',
        [tr.insertId, role, name, msg, '2026-11-05 10:22:00']
      );
    }
  }

  const contacts = [
    ['Ajay Deshpande', 'ajay.d@example.com', '9765412300', 'Corporate fleet policy enquiry', 'We have a fleet of 24 commercial vehicles in Pune and would like a quote for annual own-damage cover with AI-assisted claims.'],
    ['Meera Nair', 'meera.nair@example.com', '9822114455', 'Question about claim status', 'I submitted claim CLM-2026-0002 through my account. How long does manual review usually take?'],
  ];
  for (const [name, email, phone, subject, message] of contacts) {
    await conn.query(
      'INSERT INTO contact_messages (name,email,phone,subject,message,status,created_at) VALUES (?,?,?,?,?,?,?)',
      [name, email, phone, subject, message, 'new', '2026-11-12 09:40:00']
    );
  }

  const notifications = [
    ['rohit@autoclaim.ai', 'Claim settled — ₹83,500 credited', 'Your claim CLM-2026-0001 has been approved and the settlement amount has been transferred to your registered bank account.', '/claims/1', 'check'],
    ['rohit@autoclaim.ai', 'Policy renewal in 45 days', 'Your comprehensive policy POL-2026-1001 for MH12AB1234 expires on 11 Apr 2027. Renew early to keep your 20% no-claim bonus.', '/policies', 'shield'],
    ['vasudha@autoclaim.ai', 'Additional documents requested', 'Our adjuster has requested two close-up photos for claim CLM-2026-0002. Please upload them to avoid delays.', '/claims/2', 'file'],
    ['sneha@autoclaim.ai', 'Claim flagged for review', 'Claim CLM-2026-0004 has been routed for manual verification. Our team will contact you within 24 hours.', '/claims/4', 'alert'],
  ];
  for (const [email, title, body, link, icon] of notifications) {
    await conn.query(
      'INSERT INTO notifications (user_id,title,body,link,icon,created_at) VALUES (?,?,?,?,?,?)',
      [userIds[email], title, body, link, icon, '2026-11-15 09:00:00']
    );
  }

  // Settings
  const settings = [
    ['auto_approve_confidence', String(config.ai.autoApproveConfidence)],
    ['max_fraud_score', String(config.ai.maxFraudScore)],
    ['max_image_ai_probability', String(config.ai.maxImageAiProbability)],
    ['support_phone', config.contact.phone],
    ['support_email', config.contact.email],
    ['claim_intimation_window_hours', '48'],
    ['maintenance_mode', '0'],
  ];
  for (const [k, v] of settings) {
    await conn.query('INSERT INTO settings (setting_key,setting_value) VALUES (?,?)', [k, v]);
  }

  const auditRows = [
    [userIds['admin@autoclaim.ai'], 'Rohit Khobare', 'claim.approved', 'claim', '1', 'Approved CLM-2026-0001 for ₹83,500'],
    [userIds['admin@autoclaim.ai'], 'Rohit Khobare', 'claim.rejected', 'claim', '3', 'Rejected CLM-2026-0003 — third-party only policy'],
    [userIds['adjuster@autoclaim.ai'], 'Neha Joshi', 'claim.rejected', 'claim', '5', 'Rejected CLM-2026-0005 — policy expired'],
    [userIds['adjuster@autoclaim.ai'], 'Neha Joshi', 'ticket.replied', 'ticket', '4821', 'Replied to TKT-4821'],
    [userIds['admin@autoclaim.ai'], 'Rohit Khobare', 'settings.updated', 'settings', 'ai', 'Updated auto-approval confidence to 88%'],
  ];
  for (const [actor, name, action, entity, entityId, note] of auditRows) {
    await conn.query(
      'INSERT INTO audit_logs (actor_id,actor_name,action,entity,entity_id,meta,ip,created_at) VALUES (?,?,?,?,?,?,?,?)',
      [actor, name, action, entity, entityId, JSON.stringify({ note }), '127.0.0.1', '2026-11-10 12:00:00']
    );
  }

  await conn.end();
  console.log(`✔ Seeded ${customers.length} customers, ${Object.keys(vehicleIds).length} vehicles/policies, ${claims.length} claims.`);
  console.log('  Admin login: admin@autoclaim.ai / (ADMIN_DEMO_PASSWORD is not displayed)');
  console.log(`  Customer login: rohit@autoclaim.ai / ${config.demoPassword}`);
}

module.exports = { seedDatabase };

if (require.main === module) {
  seedDatabase({ fresh: true }).catch((err) => {
    console.error('Seed failed:', err);
    process.exit(1);
  });
}
