/**
 * Issue #392: localized country display names and country selector behavior.
 *
 * Run: npm run test:country-localization
 */

const assert = require('node:assert/strict');
const path = require('node:path');
const Module = require('module');

const moduleApi = Module;
const originalResolveFilename = moduleApi._resolveFilename;
moduleApi._resolveFilename = function (request, parent, isMain, options) {
  if (request === '@countries') {
    request = path.resolve(__dirname, '../main/countries');
  }
  return originalResolveFilename.call(this, request, parent, isMain, options);
};

const {
  COUNTRIES,
  countryMatchesQuery,
  getCountryByCode,
  getLocalizedCountryName,
  sortCountriesByLocalizedName,
} = require('../frontend/src/lib/countries');
const { LANGUAGES, getLanguageLocale } = require('../frontend/src/lib/i18n/languages');

moduleApi._resolveFilename = originalResolveFilename;

function selectedCountries() {
  return COUNTRIES.filter((country) => ['IN', 'AR', 'DE', 'US', 'JP'].includes(country.code));
}

function codes(countries) {
  return countries.map((country) => country.code);
}

/**
 * Countries stay supported independently of the UI language set, so the
 * localization expectations below cover country profiles that no longer have a
 * matching UI language (Germany, Brazil, France, Iran, Argentina). Values
 * mirror `Intl.DisplayNames` output for each registered UI locale.
 */
const EXPECTED_COUNTRY_NAMES = {
  en: { DE: 'Germany', US: 'United States', JP: 'Japan', BR: 'Brazil', FR: 'France', IR: 'Iran', AR: 'Argentina' },
  ru: { DE: 'Германия', JP: 'Япония', BR: 'Бразилия', FR: 'Франция', IR: 'Иран', AR: 'Аргентина' },
  kk: { DE: 'Германия', US: 'Америка Құрама Штаттары', JP: 'Жапония', BR: 'Бразилия', FR: 'Франция', IR: 'Иран', AR: 'Аргентина' },
};

const PROBE_COUNTRIES = ['DE', 'US', 'JP', 'BR', 'FR', 'IR', 'AR', 'IN'];

try {
  // Every registered UI language must resolve localized country names, so
  // adding or removing a language cannot silently drop this coverage.
  for (const language of Object.keys(LANGUAGES)) {
    const locale = getLanguageLocale(language);

    for (const code of PROBE_COUNTRIES) {
      const localized = getLocalizedCountryName(code, locale);
      assert.ok(localized, `${code} resolves a display name in ${locale}`);
      assert.notEqual(localized, code, `${code} does not fall back to the raw ISO code in ${locale}`);
      if (language !== 'en') {
        assert.notEqual(
          localized,
          getLocalizedCountryName(code, 'en'),
          `${code} in ${locale} is translated rather than the English name`,
        );
      }
    }

    for (const [code, expected] of Object.entries(EXPECTED_COUNTRY_NAMES[language] || {})) {
      assert.equal(getLocalizedCountryName(code, locale), expected, `${code} in ${locale} is "${expected}"`);
    }
  }

  const germany = getCountryByCode('DE');
  assert(germany, 'Germany country profile exists');
  assert(countryMatchesQuery(germany, 'Германия', 'ru-RU'), 'search matches a localized Russian name');
  assert(countryMatchesQuery(germany, 'Germany', 'ru-RU'), 'search matches the English fallback name');
  assert(countryMatchesQuery(germany, 'DE', 'ru-RU'), 'search matches the ISO country code');
  assert(countryMatchesQuery(germany, 'EUR', 'ru-RU'), 'search matches the currency');
  assert(countryMatchesQuery(germany, 'de-DE', 'ru-RU'), 'search matches the country locale');
  assert(!countryMatchesQuery(germany, 'Бразилия', 'ru-RU'), 'search excludes unrelated localized names');

  assert.deepEqual(
    codes(sortCountriesByLocalizedName(selectedCountries(), 'ru-RU')),
    ['IN', 'AR', 'DE', 'US', 'JP'],
    'Russian sorting keeps pinned countries first and then sorts localized names',
  );
  assert.deepEqual(
    codes(sortCountriesByLocalizedName(selectedCountries(), 'kk-KZ')),
    ['IN', 'AR', 'US', 'DE', 'JP'],
    'Kazakh sorting keeps pinned countries first and then sorts by its own collation',
  );

  console.log('✅ Issue #392 country localization checks passed');
} finally {
  // Keep the test isolated if a module import fails before normal completion.
  moduleApi._resolveFilename = originalResolveFilename;
}
