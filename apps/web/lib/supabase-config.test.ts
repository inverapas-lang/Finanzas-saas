import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { leerConfigSupabase } from './supabase-config';

const URL_SUPABASE = 'https://proyecto.supabase.co';

describe('leerConfigSupabase', () => {
  beforeEach(() => {
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', URL_SUPABASE);
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY', undefined);
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY', undefined);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('usa NEXT_PUBLIC_SUPABASE_ANON_KEY cuando es la única definida', () => {
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY', 'clave-anon');

    expect(leerConfigSupabase()).toEqual({ url: URL_SUPABASE, clavePublica: 'clave-anon' });
  });

  it('usa NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY (la de la integración de Vercel) si falta la anon', () => {
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY', 'clave-publishable');

    expect(leerConfigSupabase()).toEqual({ url: URL_SUPABASE, clavePublica: 'clave-publishable' });
  });

  it('pasa a la publishable si la anon existe pero está vacía', () => {
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY', '');
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY', 'clave-publishable');

    expect(leerConfigSupabase().clavePublica).toBe('clave-publishable');
  });

  it('prefiere la anon key si están las dos', () => {
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY', 'clave-anon');
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY', 'clave-publishable');

    expect(leerConfigSupabase().clavePublica).toBe('clave-anon');
  });

  it('falla si no hay ninguna clave pública', () => {
    expect(() => leerConfigSupabase()).toThrow(/NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY/);
  });

  it('falla si no hay URL', () => {
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', undefined);
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY', 'clave-anon');

    expect(() => leerConfigSupabase()).toThrow(/NEXT_PUBLIC_SUPABASE_URL/);
  });
});
