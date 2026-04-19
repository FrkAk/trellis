'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { TopBar } from '@/components/layout/TopBar';
import { PageShell } from '@/components/layout/PageShell';
import { Button } from '@/components/shared/Button';
import { dedupedFetch } from '@/lib/fetch-dedupe';

const PROVIDERS = [
  { id: 'google', label: 'Gemini (Google)', needsKey: true },
  { id: 'anthropic', label: 'Anthropic (Claude)', needsKey: true },
  { id: 'openai', label: 'OpenAI', needsKey: true },
  { id: 'ollama', label: 'Ollama (Local)', needsKey: false },
] as const;

/** Static fallbacks used when dynamic fetch fails or while loading. */
const FALLBACK_MODELS: Record<string, string[]> = {
  google: ['gemini-3.1-flash-lite-preview', 'gemini-2.5-flash', 'gemini-2.5-pro'],
  anthropic: ['claude-sonnet-4-6', 'claude-opus-4-6', 'claude-haiku-4-5'],
  openai: ['gpt-5.4', 'gpt-5.4-mini', 'gpt-4.1', 'gpt-4.1-mini', 'o3', 'o4-mini'],
  ollama: [],
};

const STORAGE_KEY = 'mymir-settings';

type Settings = {
  provider: string;
  model: string;
  apiKey: string;
};

/**
 * Load saved settings from localStorage.
 * @returns Saved settings or defaults.
 */
function loadSettings(): Settings {
  if (typeof window === 'undefined') return { provider: 'google', model: 'gemini-3.1-flash-lite-preview', apiKey: '' };
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw) as Settings;
  } catch (err) { console.warn("[settings] parse failed:", err); }
  return { provider: 'google', model: 'gemini-3.1-flash-lite-preview', apiKey: '' };
}

/**
 * Settings page for configuring LLM provider, model, and API key.
 * Fetches available models dynamically from provider APIs.
 * @returns Settings form page.
 */
export default function SettingsPage() {
  const [provider, setProvider] = useState('google');
  const [model, setModel] = useState('gemini-3.1-flash-lite-preview');
  const [apiKey, setApiKey] = useState('');
  const [showKey, setShowKey] = useState(false);
  const [saved, setSaved] = useState(false);
  const [status, setStatus] = useState<'idle' | 'testing' | 'connected' | 'error'>('idle');
  const [models, setModels] = useState<string[]>(FALLBACK_MODELS.google);
  const [loadingModels, setLoadingModels] = useState(false);
  const [savedSnapshot, setSavedSnapshot] = useState<Settings | null>(null);

  const fetchModels = useCallback(async (prov: string, key?: string) => {
    setLoadingModels(true);
    try {
      const data = await dedupedFetch(`models:${prov}:${key ?? ''}`, () =>
        fetch('/api/models', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ provider: prov, ...(key && { apiKey: key }) }),
        }).then((r) => r.json() as Promise<{ models?: string[] }>),
      );
      if (data.models && data.models.length > 0) {
        setModels(data.models);
        return data.models;
      }
    } catch (err) {
      console.warn("[settings] model fetch failed:", err);
    } finally {
      setLoadingModels(false);
    }
    const fallback = FALLBACK_MODELS[prov] ?? [];
    setModels(fallback);
    return fallback;
  }, []);

  useEffect(() => {
    const s = loadSettings();
    setProvider(s.provider);
    setModel(s.model);
    setApiKey(s.apiKey);
    setSavedSnapshot(s);
    fetchModels(s.provider, s.apiKey || undefined);
  }, [fetchModels]);

  const handleProviderChange = async (newProvider: string) => {
    setProvider(newProvider);
    setStatus('idle');
    setSaved(false);
    const fetched = await fetchModels(newProvider, newProvider === provider ? apiKey || undefined : undefined);
    setModel(fetched[0] ?? '');
  };

  const hasUnsavedChanges = savedSnapshot
    ? provider !== savedSnapshot.provider || model !== savedSnapshot.model || apiKey !== savedSnapshot.apiKey
    : false;

  const handleSave = () => {
    const settings = { provider, model, apiKey };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
    setSavedSnapshot(settings);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  const handleTest = async () => {
    setStatus('testing');
    try {
      const res = await fetch('/api/test-connection', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ provider, model, apiKey }),
      });
      setStatus(res.ok ? 'connected' : 'error');
    } catch (err) {
      console.warn("[settings] test connection failed:", err);
      setStatus('error');
    }
  };

  const isOllama = provider === 'ollama';
  const needsKey = PROVIDERS.find((p) => p.id === provider)?.needsKey ?? false;

  return (
    <>
      <TopBar />
      <PageShell className="max-w-xl">
        <Link
          href="/"
          className="mb-4 inline-flex items-center gap-1 text-sm text-text-secondary transition-colors hover:text-text-primary"
        >
          &larr; Back to projects
        </Link>
        <h1 className="text-2xl font-semibold text-text-primary mb-1">
          Settings
        </h1>
        <p className="text-sm text-text-muted mb-8">
          Configure the AI that powers brainstorming, decomposition, and refinement.
        </p>

        <div className="space-y-4">
          {/* Provider */}
          <div>
            <label className="mb-1 block font-mono text-[10px] font-semibold uppercase tracking-wider text-text-muted">
              Provider
            </label>
            <select
              value={provider}
              onChange={(e) => handleProviderChange(e.target.value)}
              className="w-full cursor-pointer rounded-lg border border-border-strong bg-surface px-3 py-2 text-sm text-text-primary outline-none focus:border-accent"
            >
              {PROVIDERS.map((p) => (
                <option key={p.id} value={p.id}>{p.label}</option>
              ))}
            </select>
          </div>

          {/* Model */}
          <div>
            <label className="mb-1 block font-mono text-[10px] font-semibold uppercase tracking-wider text-text-muted">
              Model {loadingModels && <span className="text-accent">loading...</span>}
            </label>
            {isOllama ? (
              <>
                <input
                  type="text"
                  value={model}
                  onChange={(e) => { setModel(e.target.value); setSaved(false); }}
                  placeholder="e.g. qwen3.5, llama4, mistral..."
                  list="ollama-models"
                  className="w-full rounded-lg border border-border-strong bg-surface px-3 py-2 text-sm text-text-primary placeholder:text-text-muted outline-none focus:border-accent"
                />
                {models.length > 0 && (
                  <datalist id="ollama-models">
                    {models.map((m) => <option key={m} value={m} />)}
                  </datalist>
                )}
                <p className="mt-1 text-xs text-accent/80">
                  Your model must support tool calling. Recommended: qwen3.5, llama4, mistral-nemo, deepseek-r1.
                </p>
              </>
            ) : (
              <select
                value={model}
                onChange={(e) => { setModel(e.target.value); setSaved(false); }}
                className="w-full cursor-pointer rounded-lg border border-border-strong bg-surface px-3 py-2 text-sm text-text-primary outline-none focus:border-accent"
              >
                {models.map((m) => (
                  <option key={m} value={m}>{m}</option>
                ))}
              </select>
            )}
          </div>

          {needsKey && <div className="h-px bg-border" />}

          {/* API Key */}
          {needsKey && (
            <div>
              <label className="mb-1 block font-mono text-[10px] font-semibold uppercase tracking-wider text-text-muted">
                API Key
              </label>
              <div className="flex gap-2">
                <input
                  type={showKey ? 'text' : 'password'}
                  value={apiKey}
                  onChange={(e) => { setApiKey(e.target.value); setStatus('idle'); setSaved(false); }}
                  placeholder="Enter your API key... (leave empty to use server env var)"
                  className="flex-1 rounded-lg border border-border-strong bg-surface px-3 py-2 text-sm text-text-primary placeholder:text-text-muted outline-none focus:border-accent"
                />
                <button
                  onClick={() => setShowKey(!showKey)}
                  className="cursor-pointer rounded-lg border border-border-strong bg-surface px-3 py-2 text-xs text-text-secondary transition-colors hover:bg-surface-hover"
                >
                  {showKey ? 'Hide' : 'Show'}
                </button>
              </div>
              <p className="mt-1 text-xs text-text-muted">
                If empty, the server&apos;s environment variable will be used.
              </p>
            </div>
          )}

          {/* Actions */}
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1.5">
              <Button variant="primary" size="sm" onClick={handleSave}>
                {saved ? 'Saved!' : 'Save settings'}
              </Button>
              {hasUnsavedChanges && <span className="h-1.5 w-1.5 rounded-full bg-accent" />}
            </div>
            <Button
              variant="secondary"
              size="sm"
              onClick={handleTest}
              disabled={status === 'testing'}
            >
              {status === 'testing' ? 'Testing...' : 'Test connection'}
            </Button>
            {status === 'connected' && (
              <span className="font-mono text-xs text-done">Connected</span>
            )}
            {status === 'error' && (
              <span className="font-mono text-xs text-danger">Connection failed</span>
            )}
          </div>
        </div>

        <div className="mt-8 h-px bg-gradient-to-r from-accent/20 via-accent/5 to-transparent" />

        <div className="mt-6">
          <p className="font-mono text-[10px] font-semibold uppercase tracking-wider text-text-muted mb-2">
            Note
          </p>
          <p className="text-xs text-text-secondary">
            Your coding agent is separate — use any agent you prefer via the copy-to-clipboard flow in the workspace.
            This setting only affects the built-in AI assistant for brainstorming, decomposition, and refinement.
          </p>
        </div>
      </PageShell>
    </>
  );
}
