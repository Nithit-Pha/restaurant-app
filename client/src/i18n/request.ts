import { getRequestConfig } from 'next-intl/server';
import { isLocale, routing } from './routing';

// Loads the messages for the language in the URL (see next.config.js).
export default getRequestConfig(async ({ requestLocale }) => {
  const requested = await requestLocale;
  const locale = isLocale(requested) ? requested : routing.defaultLocale;
  return {
    locale,
    messages: (await import(`../../messages/${locale}.json`)).default,
    // The restaurant is in Bangkok: times are shown in Bangkok time everywhere.
    timeZone: 'Asia/Bangkok',
  };
});
