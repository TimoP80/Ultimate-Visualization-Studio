import { useMemo, useState } from 'react';
import { TEMPLATE_CATEGORIES, type TemplateCategory } from '@/types';
import { allTemplates } from '@/templates';
import { useStudio } from '@/state/store';
import { SearchIcon } from './Icons';

type Filter = TemplateCategory | 'all';

export default function TemplateBrowser() {
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<Filter>('all');
  const addTemplateLayer = useStudio((s) => s.addTemplateLayer);
  const templates = allTemplates();

  const counts = useMemo(() => {
    const map = new Map<Filter, number>();
    map.set('all', templates.length);
    for (const t of templates) map.set(t.category, (map.get(t.category) ?? 0) + 1);
    return map;
  }, [templates]);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return templates.filter((t) => {
      if (filter !== 'all' && t.category !== filter) return false;
      if (!q) return true;
      return (
        t.name.toLowerCase().includes(q) ||
        t.description.toLowerCase().includes(q) ||
        t.tags.some((tag) => tag.includes(q))
      );
    });
  }, [templates, filter, query]);

  return (
    <>
      <div className="search-box">
        <span className="icon">
          <SearchIcon size={13} />
        </span>
        <input
          className="input"
          placeholder="Search templates"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          spellCheck={false}
        />
      </div>

      <div className="chip-row">
        <button
          className={`chip ${filter === 'all' ? 'active' : ''}`}
          onClick={() => setFilter('all')}
        >
          All <span className="chip-count">{counts.get('all')}</span>
        </button>
        {TEMPLATE_CATEGORIES.map((cat) => (
          <button
            key={cat.id}
            className={`chip ${filter === cat.id ? 'active' : ''}`}
            onClick={() => setFilter(cat.id)}
          >
            {cat.label.split(' / ')[0]}
            <span className="chip-count">{counts.get(cat.id) ?? 0}</span>
          </button>
        ))}
      </div>

      {visible.length === 0 ? (
        <div className="hint" style={{ padding: 12 }}>
          No templates match “{query}”.
        </div>
      ) : (
        <div className="template-grid">
          {visible.map((t) => (
            <button
              key={t.id}
              className="template-card"
              onClick={() => addTemplateLayer(t)}
              title={`${t.name} — ${t.description}`}
              style={{ padding: 0, textAlign: 'left' }}
            >
              <div
                className="template-thumb-fallback"
                style={{
                  background: `radial-gradient(circle at 50% 60%, ${t.palette.a}44, ${t.palette.background} 72%), linear-gradient(135deg, ${t.palette.b}22, transparent 60%)`,
                }}
              >
                <span
                  style={{
                    width: 34,
                    height: 34,
                    borderRadius: '50%',
                    border: `1.5px solid ${t.palette.a}`,
                    boxShadow: `0 0 14px ${t.palette.a}66, inset 0 0 12px ${t.palette.b}55`,
                  }}
                />
              </div>
              <div className="template-card-info">
                <span className="template-card-name">{t.name}</span>
                <span className="template-card-tags">{t.tags.slice(0, 3).join(' · ')}</span>
              </div>
            </button>
          ))}
        </div>
      )}
    </>
  );
}
