/**
 * Calendar hints for the daily schedule (spec 4.2 rule 5). Beijing dates.
 * Seasons by month (meteorological): spring Mar-May, summer Jun-Aug, autumn Sep-Nov, winter Dec-Feb.
 * Festivals are listed per year as the day of the festival itself; a festival-tagged item may be
 * scheduled in [festival - 3 days, festival]. Only traditional festivals with no religious practice
 * are used (content rule 4); no national-symbol days (rule 2).
 *
 * Dates must be extended before the schedule runs out (tools/build-schedule.js refuses to use a tag
 * for a year that is not listed).
 */

const FESTIVALS = {
  newyear: ['20270101', '20280101'],
  spring: ['20270206', '20280126'],
  lantern: ['20270220', '20280209'],
  dragon: ['20270609', '20280528'],
  midautumn: ['20270915', '20281003'],
};

const SEASON_OF_MONTH = ['winter', 'winter', 'spring', 'spring', 'spring', 'summer', 'summer', 'summer', 'autumn', 'autumn', 'autumn', 'winter'];

/** 'spring' | 'summer' | 'autumn' | 'winter' for a YYYYMMDD key. */
function seasonOf(dateKey) {
  return SEASON_OF_MONTH[Number(dateKey.slice(4, 6)) - 1];
}

module.exports = { FESTIVALS, seasonOf, FESTIVAL_LEAD_DAYS: 3 };
