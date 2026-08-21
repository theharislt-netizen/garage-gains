#!/usr/bin/env node
/**
 * Confirms the temporary +1000 gold grant is gone, new profiles start empty,
 * and existing test-seeded saves have gold/items wiped once.
 */
import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const html = await readFile(join(root, 'garage-gains.html'), 'utf8');

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

assert(!html.includes('seedTestingGoldOnce'), 'temporary gold seed function must be removed');
assert(!html.includes('state.gold = (state.gold || 0) + 1000'), 'must not add 1000 gold on launch');
assert(!html.includes('id="weeklyStrip"'), 'weekly points strip must be removed');
assert(!html.includes('id="weeklyPts"'), 'this-week points label must be removed');
assert(!html.includes('id="weekDots"'), 'weekday dots must be removed');
assert(!html.includes('id="nbDailyDot"'), 'hero-banner notification dot must be removed');
assert(html.includes('id="rankTabBadge"'), 'Rank tab notification dot must stay');
assert(/gold:\s*0/.test(html), 'defaultState must still start at 0 gold');

const begin = html.indexOf('/* === testing-economy-lib begin === */');
const end = html.indexOf('/* === testing-economy-lib end === */');
assert(begin >= 0 && end > begin, 'testing-economy-lib markers missing');
const ctx = { console };
vm.createContext(ctx);
vm.runInContext(html.slice(begin, end), ctx);

const { clearTestingEconomyOnce, isOwnerTesterIdentity, refillAdminEconomy, applyAdminSandboxPresentation } = ctx;

const seeded = {
  gold: 740,
  gems: 12,
  streakFreezes: 2,
  __testGoldSeededV26: true,
  totalPoints: 180,
  onboarding: { name: 'Haris' },
  inventory: {
    permanent: [{ instanceId: 'i1', itemId: 'boostA', star: 1 }],
    tempCharges: { rush: 3 },
    shards: { boost: 20, relic: 8 },
    stones: { boost: 1, relic: 0 },
  },
  equipped: {
    boost: [{ instanceId: 'i1', itemId: 'boostA', star: 1 }, null, null],
    relic: [null, { instanceId: 'i2', itemId: 'relicB', star: 0 }, null],
  },
};
assert(clearTestingEconomyOnce(seeded) === true, 'seeded save should clear once');
assert(seeded.gold === 0, 'gold must reset to 0');
assert(seeded.gems === 0, 'gems must reset to 0');
assert(seeded.streakFreezes === 0, 'streak freezes must reset to 0');
assert(seeded.inventory.permanent.length === 0, 'permanent items must be removed');
assert(Object.keys(seeded.inventory.tempCharges).length === 0, 'temp charges must be removed');
assert(seeded.inventory.shards.boost === 0 && seeded.inventory.stones.relic === 0, 'materials must be removed');
assert(seeded.equipped.slots && Object.keys(seeded.equipped.slots).length === 0, 'shop loadout must unequip');
assert(!seeded.__testGoldSeededV26, 'old seed flag must be dropped');
assert(seeded.__testingEconomyClearedV33 === true, 'clear flag must be set');
assert(seeded.totalPoints === 180 && seeded.onboarding.name === 'Haris', 'workouts/name must be kept');
assert(clearTestingEconomyOnce(seeded) === false, 'second pass must not wipe again');
seeded.gold = 15;
assert(clearTestingEconomyOnce(seeded) === false, 'later earned gold must be kept');
assert(seeded.gold === 15, 'later earned gold must remain 15');

const fresh = { gold: 0, gems: 0, inventory: { permanent: [] } };
assert(clearTestingEconomyOnce(fresh) === true, 'new profile should mark economy as cleared');
assert(fresh.gold === 0 && fresh.__testingEconomyClearedV33, 'new profile stays at 0 gold');

assert(isOwnerTesterIdentity(['Haris']) && isOwnerTesterIdentity(['HARIS']) && isOwnerTesterIdentity(['H. Uz']), 'owner names must unlock');
assert(!isOwnerTesterIdentity(['John']) && !isOwnerTesterIdentity(['Adventurer']) && !isOwnerTesterIdentity(['']), 'friends must not unlock');

const admin = { __adminSandbox: true, gold: 40, gems: 2, inventory: { permanent: [{ itemId: 'x' }] } };
assert(clearTestingEconomyOnce(admin) === false, 'admin sandbox must not be wiped');
assert(admin.gold === 999999 && admin.gems === 9999, 'admin gold/gems stay unlimited');
assert(admin.inventory.permanent.length === 1, 'admin test items must stay');
assert(refillAdminEconomy({ gold: 1 }) === false, 'non-admin must not refill');

assert(html.includes('id="adminModeSettingsBtn"'), 'Settings must have an Admin Mode switch');
assert(html.includes('id="adminModeToggleBtn"'), 'Profile must have an Admin Mode switch');
assert(html.includes('Back to my profile'), 'leaving Admin Mode must be one tap');
assert(html.includes("s.inventory = emptyShopInventory()"), 'admin sandbox must start with its own empty inventory');
assert(!/s\.inventory\s*=\s*from\.inventory/.test(html), 'admin must not copy main-profile items');

const present = {
  __adminSandbox: true,
  gold: 10,
  gems: 0,
  totalPoints: 50,
  selectedTitle: 'Haris',
  season: { number: 1, startDate: '', endDate: '', points: 100 },
  profile: { displayName: 'Haris', equippedBanner: null, displayedAchievementIds: [] },
  inventory: { permanent: [{ itemId: 'kept' }], tempCharges: {}, shards: { boost: 1, relic: 0 }, stones: { boost: 0, relic: 0 } },
};
assert(applyAdminSandboxPresentation(present) === true, 'stale admin profile should be restyled');
assert(present.profile.displayName === 'ADMIN', 'admin must not show the real name');
assert(present.selectedTitle === 'ADMIN', 'admin title must be ADMIN');
assert(present.season.points === 13000, 'admin season rank must be max');
assert(present.totalPoints >= 1110050, 'admin level points must be max');
assert(present.gold === 999999 && present.gems === 9999, 'admin gold/gems stay unlimited');
assert(present.inventory.permanent.length === 1 && present.inventory.permanent[0].itemId === 'kept', 'admin items must stay on the sandbox profile');
assert(applyAdminSandboxPresentation({ gold: 5, profile: { displayName: 'Haris' } }) === false, 'main profile must not be restyled as ADMIN');

console.log('testing-economy ok — no starter gold, test items wiped once, hero weekly/notify chrome removed');
