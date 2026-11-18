// Configuración general de Asfalto Regio.
// La clave publicable de Supabase es pública por diseño: la seguridad la ponen las políticas RLS.
// Se comparte el proyecto de Supabase con El Gran Millón (canales con prefijo «ar-»).
export const SUPABASE_URL = 'https://bejwavjtinwxfhhxwepc.supabase.co';
export const SUPABASE_KEY = 'sb_publishable_dm8Q2WACLEGgqhGVVe5cOQ_x7gJzw3j';

export const GAME_NAME = 'Asfalto Regio';
export const MAX_PLAYERS = 8;
export const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

// Red: P2P (WebRTC) para los autos; si falla, respaldo por Supabase a menor frecuencia.
export const ICE_SERVERS = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
  { urls: 'stun:stun.cloudflare.com:3478' },
];
export const NET_RATE_P2P = 20;      // envíos por segundo del estado del auto
export const NET_RATE_RELAY = 6;     // por Supabase (cuota de mensajes)
export const INTERP_DELAY_MS = 120;  // retraso de interpolación de autos remotos
