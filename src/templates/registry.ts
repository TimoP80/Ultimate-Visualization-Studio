/**
 * Template registry.
 *
 * Templates are registered by the category modules and looked up by id. The
 * renderer resolves a layer to a template through {@link getTemplate}, so a
 * layer only ever stores a template id — never shader source.
 */

import type { Layer, TemplateDef } from '@/types';

const templates: TemplateDef[] = [];
const templateMap = new Map<string, TemplateDef>();

export function registerTemplate(def: TemplateDef): void {
  if (templateMap.has(def.id)) {
    // Re-registration replaces the entry; keeps hot reloads predictable.
    const idx = templates.findIndex((t) => t.id === def.id);
    if (idx >= 0) templates[idx] = def;
  } else {
    templates.push(def);
  }
  templateMap.set(def.id, def);
}

export function registerTemplates(defs: TemplateDef[]): void {
  for (const def of defs) registerTemplate(def);
}

export function allTemplates(): TemplateDef[] {
  return templates;
}

export function getTemplateById(id: string | undefined | null): TemplateDef | null {
  if (!id) return null;
  return templateMap.get(id) ?? null;
}

/**
 * A `shader` layer carries its own source; wrap it in a synthetic definition so
 * the renderer can treat it exactly like a built-in template.
 */
function syntheticShaderTemplate(layer: Layer): TemplateDef | null {
  if (!layer.shaderSource || layer.shaderSource.trim().length === 0) return null;
  return {
    id: `custom:${layer.id}`,
    name: layer.name || 'Custom Shader',
    category: 'abstract',
    description: 'User shader',
    tags: ['shader', 'custom'],
    frag: layer.shaderSource,
    params: [],
    palette: layer.palette,
    composite: 'normal',
    usesFeedback: layer.shaderSource.includes('uPrev'),
  };
}

export function getTemplate(layer: Layer): TemplateDef | null {
  const built = getTemplateById(layer.templateId);
  if (built) return built;
  return syntheticShaderTemplate(layer);
}

/** The fragment source to compile for a template, honouring layer overrides. */
export function compileTemplateShader(template: TemplateDef, shaderOverride?: string): string {
  if (shaderOverride && shaderOverride.trim().length > 0) return shaderOverride;
  return template.frag;
}

export function templatesByCategory(category: TemplateDef['category']): TemplateDef[] {
  return templates.filter((t) => t.category === category);
}
