import { default as _Gun } from 'gun';
import { IGunStatic } from './static';
/**
 * Gun constructor.
 * 
 * Use this type instead of the Gun's default import
 * if you run into type issues with the Gun constructor.
 */
const Gun: IGunStatic = _Gun as any;
export default Gun;
