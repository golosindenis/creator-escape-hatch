export function getEnv() {
  const required = (k: string) => {
    const v = process.env[k];
    if (!v) throw new Error(`Missing env var: ${k}`);
    return v;
  };
  return {
    supabaseUrl: required("NEXT_PUBLIC_SUPABASE_URL"),
    supabaseAnonKey: required("NEXT_PUBLIC_SUPABASE_ANON_KEY"),
    resendApiKey: required("RESEND_API_KEY"),
    appUrl: required("NEXT_PUBLIC_APP_URL"),
  };
}
