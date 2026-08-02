/**
 * #93: the enum MOVED to src/core/unitActions.ts so the replay applier can
 * decode build columns without a src->scripts inversion. This shim keeps the
 * scripts-side import paths working; the layout lives in ONE place.
 */
export { DEDICATED_IMPROVEMENTS, unitActionNames, unitActionIndex } from '../src/core/unitActions';
