import type { CountryCode, LanguageCode, NicheSlug } from '@/lib/types';

/**
 * Raw publisher records. These are fictional websites used as marketplace seed
 * data. Prices are in whole pounds and are converted to minor units by the
 * builder in `websites.ts`. A `0` price means the service is not offered.
 */
export interface RawWebsite {
  d: string;
  t: string;
  n: NicheSlug;
  s?: NicheSlug[];
  c: CountryCode;
  l: LanguageCode;
  dr: number;
  tr: number;
  rd: number;
  gp: number;
  ne: number;
  pr: number;
  tmin: number;
  tmax: number;
  desc: string;
}

export const rawWebsites: RawWebsite[] = [
  // ---------------------------------------------------------------- iGaming
  { d: 'casinoguru.co.uk', t: 'Casino Guru UK', n: 'igaming', s: ['entertainment'], c: 'GB', l: 'en', dr: 62, tr: 48000, rd: 8100, gp: 180, ne: 140, pr: 450, tmin: 2, tmax: 3, desc: 'UK casino review desk covering licensing, bonuses and responsible play.' },
  { d: 'slotsignal.com', t: 'Slot Signal', n: 'igaming', c: 'US', l: 'en', dr: 55, tr: 31500, rd: 4200, gp: 210, ne: 165, pr: 0, tmin: 3, tmax: 5, desc: 'Slot mechanics, RTP analysis and provider news for US players.' },
  { d: 'bettingedge.co.uk', t: 'Betting Edge', n: 'igaming', s: ['sports'], c: 'GB', l: 'en', dr: 68, tr: 96000, rd: 12400, gp: 320, ne: 240, pr: 690, tmin: 3, tmax: 5, desc: 'Sports betting strategy, odds comparison and bookmaker reviews.' },
  { d: 'wagerwise.ca', t: 'WagerWise Canada', n: 'igaming', c: 'CA', l: 'en', dr: 47, tr: 18200, rd: 2650, gp: 150, ne: 110, pr: 0, tmin: 2, tmax: 4, desc: 'Provincial sportsbook guides and Ontario regulated market coverage.' },
  { d: 'reelverdict.com.au', t: 'Reel Verdict', n: 'igaming', c: 'AU', l: 'en', dr: 51, tr: 22400, rd: 3100, gp: 175, ne: 130, pr: 0, tmin: 3, tmax: 6, desc: 'Australian pokies and online casino reviews with payout testing.' },
  { d: 'spielbankjournal.de', t: 'Spielbank Journal', n: 'igaming', c: 'DE', l: 'de', dr: 58, tr: 41000, rd: 5400, gp: 260, ne: 190, pr: 520, tmin: 4, tmax: 7, desc: 'German-language casino journal tracking the GlüStV licensing regime.' },
  { d: 'oddsatlas.ie', t: 'Odds Atlas', n: 'igaming', s: ['sports'], c: 'IE', l: 'en', dr: 44, tr: 12800, rd: 1980, gp: 135, ne: 95, pr: 0, tmin: 2, tmax: 4, desc: 'Irish racing and football odds data with bookmaker offer tracking.' },

  // ----------------------------------------------------------------- Sports
  { d: 'terracetalk.co.uk', t: 'Terrace Talk', n: 'sports', c: 'GB', l: 'en', dr: 64, tr: 74000, rd: 9600, gp: 240, ne: 180, pr: 540, tmin: 2, tmax: 4, desc: 'Football fan journalism covering the Premier League and EFL.' },
  { d: 'pitchsideweekly.com', t: 'Pitchside Weekly', n: 'sports', c: 'US', l: 'en', dr: 57, tr: 52000, rd: 6300, gp: 195, ne: 145, pr: 430, tmin: 3, tmax: 5, desc: 'North American soccer analysis, MLS transfers and tactical breakdowns.' },
  { d: 'endurancelab.co.uk', t: 'Endurance Lab', n: 'sports', s: ['health'], c: 'GB', l: 'en', dr: 49, tr: 26400, rd: 3400, gp: 160, ne: 120, pr: 0, tmin: 3, tmax: 5, desc: 'Running, triathlon and cycling training science for amateur athletes.' },
  { d: 'courtsidenotes.com', t: 'Courtside Notes', n: 'sports', c: 'US', l: 'en', dr: 60, tr: 88000, rd: 7800, gp: 275, ne: 205, pr: 0, tmin: 2, tmax: 4, desc: 'Basketball analytics, draft coverage and franchise business reporting.' },
  { d: 'scrumandline.com.au', t: 'Scrum and Line', n: 'sports', c: 'AU', l: 'en', dr: 46, tr: 19800, rd: 2400, gp: 145, ne: 105, pr: 0, tmin: 4, tmax: 7, desc: 'Rugby league and union coverage across the NRL and Super Rugby.' },
  { d: 'nordicsportdaily.se', t: 'Nordic Sport Daily', n: 'sports', c: 'SE', l: 'sv', dr: 53, tr: 29500, rd: 4100, gp: 185, ne: 140, pr: 0, tmin: 4, tmax: 8, desc: 'Swedish-language coverage of winter sport, handball and Allsvenskan.' },

  // ---------------------------------------------------------------- Finance
  { d: 'ledgerloop.co.uk', t: 'Ledger Loop', n: 'finance', s: ['business'], c: 'GB', l: 'en', dr: 71, tr: 142000, rd: 15800, gp: 420, ne: 310, pr: 890, tmin: 3, tmax: 5, desc: 'UK personal finance desk covering ISAs, mortgages and pensions.' },
  { d: 'capitalcadence.com', t: 'Capital Cadence', n: 'finance', c: 'US', l: 'en', dr: 74, tr: 218000, rd: 21400, gp: 520, ne: 390, pr: 1150, tmin: 4, tmax: 7, desc: 'Markets and investing publication for self-directed US investors.' },
  { d: 'thriftdial.co.uk', t: 'Thrift Dial', n: 'finance', s: ['lifestyle'], c: 'GB', l: 'en', dr: 52, tr: 34500, rd: 4600, gp: 185, ne: 135, pr: 0, tmin: 2, tmax: 4, desc: 'Household budgeting, energy switching and cost-of-living guidance.' },
  { d: 'prudentpath.ca', t: 'Prudent Path', n: 'finance', c: 'CA', l: 'en', dr: 56, tr: 38700, rd: 5200, gp: 230, ne: 170, pr: 0, tmin: 3, tmax: 6, desc: 'Canadian retirement planning, RRSP and TFSA strategy coverage.' },
  { d: 'yieldharbour.com', t: 'Yield Harbour', n: 'finance', s: ['crypto'], c: 'US', l: 'en', dr: 63, tr: 71000, rd: 8900, gp: 340, ne: 250, pr: 720, tmin: 3, tmax: 5, desc: 'Fixed income, dividend investing and alternative yield research.' },
  { d: 'fiskalnotiz.de', t: 'Fiskal Notiz', n: 'finance', c: 'DE', l: 'de', dr: 59, tr: 46200, rd: 6100, gp: 290, ne: 215, pr: 0, tmin: 5, tmax: 8, desc: 'German tax, savings and Altersvorsorge explainers for retail readers.' },
  { d: 'moneymapped.com.au', t: 'Money Mapped', n: 'finance', c: 'AU', l: 'en', dr: 50, tr: 27300, rd: 3500, gp: 175, ne: 130, pr: 0, tmin: 3, tmax: 6, desc: 'Australian superannuation, home loans and household money guides.' },

  // ------------------------------------------------------------- Technology
  { d: 'stackpilot.io', t: 'Stack Pilot', n: 'technology', s: ['business'], c: 'US', l: 'en', dr: 69, tr: 118000, rd: 13200, gp: 380, ne: 280, pr: 760, tmin: 3, tmax: 5, desc: 'Engineering leadership, developer tooling and platform architecture.' },
  { d: 'bytehorizon.com', t: 'Byte Horizon', n: 'technology', c: 'US', l: 'en', dr: 66, tr: 94000, rd: 10800, gp: 330, ne: 245, pr: 0, tmin: 3, tmax: 6, desc: 'Consumer tech reviews, AI product coverage and buying guides.' },
  { d: 'devnotebook.co.uk', t: 'Dev Notebook', n: 'technology', c: 'GB', l: 'en', dr: 58, tr: 43000, rd: 6700, gp: 230, ne: 175, pr: 0, tmin: 2, tmax: 4, desc: 'Practical tutorials for web developers, from TypeScript to Postgres.' },
  { d: 'cloudcanvas.io', t: 'Cloud Canvas', n: 'technology', s: ['business'], c: 'IE', l: 'en', dr: 61, tr: 57500, rd: 7300, gp: 295, ne: 220, pr: 640, tmin: 3, tmax: 5, desc: 'Cloud infrastructure, FinOps and DevOps practice reporting.' },
  { d: 'siliconslate.com', t: 'Silicon Slate', n: 'technology', s: ['business'], c: 'US', l: 'en', dr: 72, tr: 165000, rd: 17600, gp: 450, ne: 330, pr: 980, tmin: 4, tmax: 7, desc: 'Technology business daily covering funding, product and policy.' },
  { d: 'techtrommel.de', t: 'Tech Trommel', n: 'technology', c: 'DE', l: 'de', dr: 54, tr: 33800, rd: 4900, gp: 245, ne: 180, pr: 0, tmin: 5, tmax: 8, desc: 'German consumer technology and smart home product journalism.' },
  { d: 'gadgetgleam.co.uk', t: 'Gadget Gleam', n: 'technology', s: ['lifestyle'], c: 'GB', l: 'en', dr: 48, tr: 21600, rd: 2900, gp: 145, ne: 105, pr: 0, tmin: 2, tmax: 4, desc: 'Hands-on gadget reviews and deal coverage for UK shoppers.' },

  // --------------------------------------------------------------- Business
  { d: 'ventureledger.com', t: 'Venture Ledger', n: 'business', s: ['finance'], c: 'US', l: 'en', dr: 70, tr: 128000, rd: 14100, gp: 410, ne: 300, pr: 860, tmin: 4, tmax: 6, desc: 'Startup funding rounds, cap table mechanics and founder interviews.' },
  { d: 'scaleupdesk.co.uk', t: 'Scale Up Desk', n: 'business', c: 'GB', l: 'en', dr: 59, tr: 49500, rd: 6400, gp: 265, ne: 195, pr: 580, tmin: 3, tmax: 5, desc: 'Growth operations and go-to-market reporting for UK scale-ups.' },
  { d: 'opsandorder.com', t: 'Ops and Order', n: 'business', s: ['technology'], c: 'US', l: 'en', dr: 55, tr: 36200, rd: 4800, gp: 215, ne: 160, pr: 0, tmin: 3, tmax: 6, desc: 'Supply chain, logistics and operations management case studies.' },
  { d: 'foundersfrontier.ca', t: 'Founders Frontier', n: 'business', c: 'CA', l: 'en', dr: 51, tr: 24800, rd: 3300, gp: 170, ne: 125, pr: 0, tmin: 3, tmax: 6, desc: 'Canadian small business, grants and entrepreneurship reporting.' },
  { d: 'bizbriefing.nl', t: 'Biz Briefing', n: 'business', c: 'NL', l: 'nl', dr: 53, tr: 28900, rd: 3900, gp: 225, ne: 165, pr: 0, tmin: 4, tmax: 8, desc: 'Dutch business briefing covering SMEs, tax and employment law.' },

  // ----------------------------------------------------------------- Health
  { d: 'vitalityvault.co.uk', t: 'Vitality Vault', n: 'health', s: ['lifestyle'], c: 'GB', l: 'en', dr: 61, tr: 68000, rd: 8200, gp: 290, ne: 215, pr: 610, tmin: 3, tmax: 5, desc: 'Evidence-led wellness, supplements and preventative health writing.' },
  { d: 'clinicalclarity.com', t: 'Clinical Clarity', n: 'health', c: 'US', l: 'en', dr: 67, tr: 102000, rd: 11900, gp: 395, ne: 290, pr: 830, tmin: 5, tmax: 8, desc: 'Medically reviewed explainers on conditions, treatment and cost.' },
  { d: 'mindfulmeter.com', t: 'Mindful Meter', n: 'health', c: 'US', l: 'en', dr: 52, tr: 31200, rd: 4300, gp: 185, ne: 140, pr: 0, tmin: 3, tmax: 5, desc: 'Mental health, sleep and stress management reporting.' },
  { d: 'welltrackdaily.ca', t: 'WellTrack Daily', n: 'health', c: 'CA', l: 'en', dr: 47, tr: 20100, rd: 2700, gp: 150, ne: 110, pr: 0, tmin: 3, tmax: 6, desc: 'Canadian healthcare access, fitness and family wellbeing coverage.' },
  { d: 'nutrinotes.co.uk', t: 'Nutri Notes', n: 'health', s: ['food'], c: 'GB', l: 'en', dr: 45, tr: 16800, rd: 2200, gp: 130, ne: 95, pr: 0, tmin: 2, tmax: 4, desc: 'Registered-dietitian nutrition guides and meal planning.' },

  // ----------------------------------------------------------------- Travel
  { d: 'wanderwrit.com', t: 'Wander Writ', n: 'travel', c: 'US', l: 'en', dr: 63, tr: 76500, rd: 9100, gp: 285, ne: 210, pr: 620, tmin: 3, tmax: 6, desc: 'Long-form destination journalism and slow travel itineraries.' },
  { d: 'slowmiles.co.uk', t: 'Slow Miles', n: 'travel', s: ['lifestyle'], c: 'GB', l: 'en', dr: 54, tr: 37400, rd: 4700, gp: 195, ne: 145, pr: 0, tmin: 2, tmax: 5, desc: 'UK rail travel, staycations and weekend break planning.' },
  { d: 'coastlinecompass.com.au', t: 'Coastline Compass', n: 'travel', c: 'AU', l: 'en', dr: 49, tr: 23600, rd: 3100, gp: 160, ne: 120, pr: 0, tmin: 4, tmax: 7, desc: 'Australian coastal guides, road trips and national park routes.' },
  { d: 'viaggioverso.it', t: 'Viaggio Verso', n: 'travel', c: 'IT', l: 'it', dr: 56, tr: 42800, rd: 5600, gp: 240, ne: 180, pr: 0, tmin: 5, tmax: 8, desc: 'Italian travel magazine covering regional food, culture and hotels.' },
  { d: 'nomadledger.com', t: 'Nomad Ledger', n: 'travel', s: ['finance'], c: 'US', l: 'en', dr: 50, tr: 26900, rd: 3600, gp: 175, ne: 130, pr: 0, tmin: 3, tmax: 5, desc: 'Remote work visas, travel banking and nomad cost breakdowns.' },

  // -------------------------------------------------------------- Lifestyle
  { d: 'themodernmantel.co.uk', t: 'The Modern Mantel', n: 'lifestyle', s: ['home-garden'], c: 'GB', l: 'en', dr: 57, tr: 44200, rd: 5800, gp: 225, ne: 165, pr: 500, tmin: 3, tmax: 5, desc: 'Considered interiors, style and modern living for UK homes.' },
  { d: 'everydayember.com', t: 'Everyday Ember', n: 'lifestyle', c: 'US', l: 'en', dr: 60, tr: 59800, rd: 7100, gp: 255, ne: 190, pr: 0, tmin: 3, tmax: 5, desc: 'Family life, parenting and seasonal living features.' },
  { d: 'curatedcalm.com', t: 'Curated Calm', n: 'lifestyle', s: ['health'], c: 'US', l: 'en', dr: 48, tr: 22800, rd: 3000, gp: 150, ne: 110, pr: 0, tmin: 2, tmax: 4, desc: 'Slow living, minimalism and home wellbeing rituals.' },
  { d: 'livingluxe.ca', t: 'Living Luxe', n: 'lifestyle', c: 'CA', l: 'en', dr: 52, tr: 30400, rd: 4000, gp: 190, ne: 140, pr: 420, tmin: 3, tmax: 6, desc: 'Premium lifestyle, watches, design and luxury travel for Canada.' },
  { d: 'stilraum.de', t: 'Stilraum', n: 'lifestyle', s: ['home-garden'], c: 'DE', l: 'de', dr: 50, tr: 25600, rd: 3400, gp: 215, ne: 160, pr: 0, tmin: 5, tmax: 8, desc: 'German design and lifestyle magazine covering interiors and style.' },

  // ----------------------------------------------------------------- Crypto
  { d: 'chainbeacon.io', t: 'Chain Beacon', n: 'crypto', s: ['finance'], c: 'US', l: 'en', dr: 65, tr: 83000, rd: 10200, gp: 360, ne: 270, pr: 780, tmin: 2, tmax: 4, desc: 'Blockchain infrastructure, protocol upgrades and on-chain data.' },
  { d: 'tokentrail.co.uk', t: 'Token Trail', n: 'crypto', c: 'GB', l: 'en', dr: 56, tr: 39600, rd: 5300, gp: 265, ne: 195, pr: 0, tmin: 2, tmax: 4, desc: 'UK-focused crypto tax, exchange reviews and market explainers.' },
  { d: 'blockbriefed.com', t: 'Block Briefed', n: 'crypto', c: 'US', l: 'en', dr: 59, tr: 51200, rd: 6800, gp: 300, ne: 225, pr: 0, tmin: 2, tmax: 5, desc: 'Daily digital asset briefing for traders and institutional desks.' },
  { d: 'satoshisignal.com', t: 'Satoshi Signal', n: 'crypto', c: 'CA', l: 'en', dr: 53, tr: 34100, rd: 4500, gp: 240, ne: 180, pr: 0, tmin: 3, tmax: 5, desc: 'Bitcoin-first analysis, mining economics and self-custody guides.' },
  { d: 'defidispatch.io', t: 'DeFi Dispatch', n: 'crypto', c: 'IE', l: 'en', dr: 51, tr: 28700, rd: 3900, gp: 230, ne: 170, pr: 0, tmin: 2, tmax: 4, desc: 'Decentralised finance protocols, yields and security incidents.' },

  // ---------------------------------------------------------- Entertainment
  { d: 'screenshelf.co.uk', t: 'Screen Shelf', n: 'entertainment', c: 'GB', l: 'en', dr: 58, tr: 62000, rd: 7400, gp: 215, ne: 160, pr: 470, tmin: 2, tmax: 4, desc: 'Film and television criticism with streaming release coverage.' },
  { d: 'primetimepost.com', t: 'Primetime Post', n: 'entertainment', c: 'US', l: 'en', dr: 64, tr: 98000, rd: 11200, gp: 310, ne: 230, pr: 0, tmin: 3, tmax: 5, desc: 'Entertainment news desk covering studios, ratings and casting.' },
  { d: 'soundstagedaily.com', t: 'Soundstage Daily', n: 'entertainment', c: 'US', l: 'en', dr: 55, tr: 40600, rd: 5500, gp: 205, ne: 155, pr: 0, tmin: 3, tmax: 5, desc: 'Music industry reporting, tours, releases and artist features.' },
  { d: 'bingebeacon.com', t: 'Binge Beacon', n: 'entertainment', c: 'AU', l: 'en', dr: 46, tr: 18900, rd: 2500, gp: 135, ne: 100, pr: 0, tmin: 3, tmax: 6, desc: 'Streaming guides and what-to-watch lists for Australian viewers.' },
  { d: 'kulturkanal.de', t: 'Kulturkanal', n: 'entertainment', c: 'DE', l: 'de', dr: 52, tr: 29800, rd: 4100, gp: 225, ne: 165, pr: 0, tmin: 5, tmax: 8, desc: 'German culture desk covering cinema, theatre and music.' },

  // ------------------------------------------------------------- Automotive
  { d: 'torqueterrace.co.uk', t: 'Torque Terrace', n: 'automotive', c: 'GB', l: 'en', dr: 59, tr: 54300, rd: 6900, gp: 250, ne: 185, pr: 550, tmin: 3, tmax: 5, desc: 'UK motoring reviews, running costs and used car buying advice.' },
  { d: 'mileagemonthly.com', t: 'Mileage Monthly', n: 'automotive', c: 'US', l: 'en', dr: 62, tr: 79400, rd: 9300, gp: 295, ne: 220, pr: 0, tmin: 3, tmax: 6, desc: 'Car ownership economics, insurance and maintenance reporting.' },
  { d: 'evinsider.co.uk', t: 'EV Insider', n: 'automotive', s: ['technology'], c: 'GB', l: 'en', dr: 54, tr: 35800, rd: 4600, gp: 220, ne: 165, pr: 0, tmin: 2, tmax: 4, desc: 'Electric vehicle range tests, charging networks and grant guidance.' },
  { d: 'autobahnnotes.de', t: 'Autobahn Notes', n: 'automotive', c: 'DE', l: 'de', dr: 57, tr: 45700, rd: 6000, gp: 275, ne: 205, pr: 0, tmin: 5, tmax: 8, desc: 'German motoring journal covering road tests and industry news.' },
  { d: 'garagegrit.com.au', t: 'Garage Grit', n: 'automotive', c: 'AU', l: 'en', dr: 44, tr: 15200, rd: 2100, gp: 125, ne: 90, pr: 0, tmin: 4, tmax: 7, desc: 'Aftermarket parts, 4WD builds and workshop how-to content.' },

  // ------------------------------------------------------------------- Food
  { d: 'saltandskillet.co.uk', t: 'Salt and Skillet', n: 'food', s: ['lifestyle'], c: 'GB', l: 'en', dr: 56, tr: 47800, rd: 6200, gp: 210, ne: 155, pr: 0, tmin: 2, tmax: 4, desc: 'Tested recipes, kitchen kit reviews and British produce features.' },
  { d: 'forkandfable.com', t: 'Fork and Fable', n: 'food', c: 'US', l: 'en', dr: 61, tr: 72300, rd: 8600, gp: 265, ne: 195, pr: 560, tmin: 3, tmax: 5, desc: 'Restaurant criticism, chef profiles and food culture essays.' },
  { d: 'pantrypilgrim.com', t: 'Pantry Pilgrim', n: 'food', s: ['health'], c: 'US', l: 'en', dr: 49, tr: 24100, rd: 3200, gp: 155, ne: 115, pr: 0, tmin: 2, tmax: 4, desc: 'Budget batch cooking, pantry staples and meal prep systems.' },
  { d: 'tavolaverde.it', t: 'Tavola Verde', n: 'food', c: 'IT', l: 'it', dr: 53, tr: 32700, rd: 4400, gp: 230, ne: 170, pr: 0, tmin: 5, tmax: 8, desc: 'Italian seasonal cooking, regional wine and produce reporting.' },
  { d: 'brewandbite.ca', t: 'Brew and Bite', n: 'food', c: 'CA', l: 'en', dr: 45, tr: 17400, rd: 2300, gp: 135, ne: 100, pr: 0, tmin: 3, tmax: 6, desc: 'Canadian coffee, craft beer and casual dining coverage.' },

  // -------------------------------------------------------- Home and Garden
  { d: 'thepottedporch.com', t: 'The Potted Porch', n: 'home-garden', c: 'US', l: 'en', dr: 55, tr: 41300, rd: 5400, gp: 200, ne: 150, pr: 0, tmin: 3, tmax: 5, desc: 'Container gardening, patio design and seasonal planting guides.' },
  { d: 'hearthandhedge.co.uk', t: 'Hearth and Hedge', n: 'home-garden', s: ['lifestyle'], c: 'GB', l: 'en', dr: 58, tr: 50600, rd: 6600, gp: 235, ne: 175, pr: 510, tmin: 2, tmax: 5, desc: 'Home renovation, heating efficiency and British garden design.' },
  { d: 'roomrenewal.com', t: 'Room Renewal', n: 'home-garden', c: 'US', l: 'en', dr: 60, tr: 66500, rd: 7900, gp: 270, ne: 200, pr: 0, tmin: 3, tmax: 6, desc: 'Remodelling cost guides, contractor advice and interior projects.' },
  { d: 'gardengrain.co.uk', t: 'Garden Grain', n: 'home-garden', c: 'GB', l: 'en', dr: 47, tr: 19600, rd: 2600, gp: 140, ne: 105, pr: 0, tmin: 2, tmax: 4, desc: 'Allotment growing, soil health and UK planting calendars.' },
  { d: 'wohnrevier.de', t: 'Wohnrevier', n: 'home-garden', c: 'DE', l: 'de', dr: 51, tr: 27100, rd: 3700, gp: 220, ne: 160, pr: 0, tmin: 5, tmax: 8, desc: 'German home and garden magazine covering renovation and decor.' },
];
