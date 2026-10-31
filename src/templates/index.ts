/**
 * Template library entry point.
 *
 * Importing this module registers every built-in template as a side effect.
 * The app imports it once at startup; the renderer only ever resolves templates
 * by id through `registry.ts`, so registration order does not matter.
 */

import './classic';
import './electronic';
import './hardcore';
import './misc';

export {
  allTemplates,
  getTemplate,
  getTemplateById,
  registerTemplate,
  registerTemplates,
  templatesByCategory,
} from './registry';
