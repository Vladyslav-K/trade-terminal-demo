import { MAX_MARKETS } from '@trade-terminal/protocol';
import type { MarketInfo, VenueInfo } from '@trade-terminal/protocol';

export const VENUES: VenueInfo[] = [
  { code: 'A', name: 'Northbook' },
  { code: 'B', name: 'Kestrel' },
];

const CATEGORIES = ['Macro', 'Crypto', 'Sports', 'Tech', 'Weather'] as const;

type Category = (typeof CATEGORIES)[number];

const MONTHS = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];
const QUARTERS = ['Q1', 'Q2', 'Q3', 'Q4'];
const QUARTER_ENDS = ['Mar 31', 'Jun 30', 'Sep 30', 'Dec 31'];
const HALF_YEAR_ENDS = ['Jun 30', 'Dec 31'];
const TEAMS = [
  'North',
  'South',
  'East',
  'West',
  'Harbor',
  'Summit',
  'Valley',
  'Coast',
];
const CITIES = ['Riverton', 'Lakeside', 'Highmoor', 'Elmstead', 'Port Ardent'];

function combine(
  firsts: readonly string[],
  seconds: readonly string[],
  build: (first: string, second: string) => string,
): string[] {
  return firsts.flatMap((first) =>
    seconds.map((second) => build(first, second)),
  );
}

const TITLES: Record<Category, string[]> = {
  Macro: [
    ...MONTHS.map((month) => `Fed cuts rates in ${month}`),
    ...combine(
      ['3.0', '3.5', '4.0'],
      QUARTERS,
      (level, quarter) => `Inflation above ${level}% in ${quarter}`,
    ),
    ...combine(
      ['2.0', '2.5', '3.0'],
      QUARTERS,
      (level, quarter) => `GDP growth above ${level}% in ${quarter}`,
    ),
    ...combine(
      ['4.5', '5.0'],
      HALF_YEAR_ENDS,
      (level, date) => `Unemployment above ${level}% by ${date}`,
    ),
  ],
  Crypto: [
    ...combine(
      ['100k', '125k', '150k', '175k', '200k'],
      QUARTER_ENDS,
      (price, date) => `BTC above $${price} by ${date}`,
    ),
    ...combine(
      ['4k', '5k', '6k', '8k', '10k'],
      HALF_YEAR_ENDS,
      (price, date) => `ETH above $${price} by ${date}`,
    ),
    ...combine(
      ['3T', '4T', '5T', '6T', '8T'],
      HALF_YEAR_ENDS,
      (cap, date) => `Crypto market cap above $${cap} by ${date}`,
    ),
  ],
  Sports: [
    ...TEAMS.map((team) => `Team ${team} wins the final`),
    ...TEAMS.map((team) => `Team ${team} reaches the semifinal`),
    ...TEAMS.map((team) => `Team ${team} wins the league`),
    ...combine(
      TEAMS,
      ['Saturday', 'Sunday'],
      (team, day) => `Team ${team} scores 3+ goals on ${day}`,
    ),
  ],
  Tech: [
    ...combine(
      ['100', '500', '1000', '5000'],
      HALF_YEAR_ENDS,
      (qubits, date) =>
        `Quantum computer reaches ${qubits} logical qubits by ${date}`,
    ),
    ...combine(
      ['50', '60', '70', '80'],
      HALF_YEAR_ENDS,
      (power, date) => `Data center capacity above ${power} GW by ${date}`,
    ),
    ...combine(
      ['20', '25', '30', '35'],
      ['Q2', 'Q4'],
      (share, quarter) => `EV share above ${share}% in ${quarter}`,
    ),
    ...combine(
      ['5M', '10M', '15M', '20M'],
      HALF_YEAR_ENDS,
      (users, date) => `Satellite internet users above ${users} by ${date}`,
    ),
    ...QUARTERS.map(
      (quarter) => `Open-weight model tops leaderboard in ${quarter}`,
    ),
    ...QUARTERS.map((quarter) => `Smartphone shipments grow in ${quarter}`),
  ],
  Weather: [
    ...combine(
      CITIES,
      ['35°C in July', '35°C in August', '40°C in July', '40°C in August'],
      (city, heat) => `${city} hits ${heat}`,
    ),
    ...combine(
      CITIES,
      ['50 mm of rain in April', '100 mm of rain in May'],
      (city, rain) => `${city} gets ${rain}`,
    ),
    ...combine(
      CITIES,
      ['Nov 30', 'Dec 31'],
      (city, date) => `${city} sees first snow by ${date}`,
    ),
  ],
};

// Categories are interleaved, so any market count mixes all of them.
function buildCatalog(): MarketInfo[] {
  const catalog: MarketInfo[] = [];

  for (let id = 0; id < MAX_MARKETS; id++) {
    const category = CATEGORIES[id % CATEGORIES.length];
    const title =
      category && TITLES[category][Math.floor(id / CATEGORIES.length)];
    if (!category || !title) {
      throw new Error(`Not enough market titles for market ${id}`);
    }
    catalog.push({ id, title, category });
  }

  if (new Set(catalog.map((market) => market.title)).size !== MAX_MARKETS) {
    throw new Error('Market titles must be unique');
  }

  return catalog;
}

const MARKET_CATALOG = buildCatalog();

export function getMarkets(count: number): MarketInfo[] {
  return MARKET_CATALOG.slice(0, count).map((market) => ({ ...market }));
}
