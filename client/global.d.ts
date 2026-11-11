// Message keys are checked by TypeScript: t('checkout.placeOrder') must exist
// in messages/en.json, or the type check fails. th.json must have the same keys.
type Messages = typeof import('./messages/en.json');
declare interface IntlMessages extends Messages {}
