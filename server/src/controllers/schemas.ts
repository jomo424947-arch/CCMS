import { z } from 'zod';

export const loginSchema = z.object({
  email: z.string().email('Valid email required'),
  password: z.string().min(1, 'Password required'),
  rememberMe: z.boolean().optional().default(false),
});

export const signupSchema = z.object({
  email: z.string().email('Valid email required'),
  password: z.string().min(8, 'Password must be at least 8 characters'),
  fullName: z.string().min(2, 'Full name required').max(120).optional(),
});

export const forgotPasswordSchema = z.object({
  email: z.string().email('Valid email required'),
});

export const resetPasswordSchema = z.object({
  token: z.string().min(1, 'Token required'),
  newPassword: z.string().min(8, 'Password must be at least 8 characters'),
});

export const verifyEmailSchema = z.object({
  token: z.string().min(1, 'Token required'),
});

export const createDeviceSchema = z.object({
  name: z.string().min(1, 'Name required').max(60),
  type: z.enum(['pc', 'console', 'vr', 'table']).default('pc'),
  hourly_rate: z.number().nonnegative().default(0),
  hourly_rate_multi: z.number().nonnegative().optional(),
  specs: z.record(z.unknown()).optional().nullable(),
  is_managed: z.boolean().optional().default(false),
  device_number: z.number().int().positive().optional().nullable(),
});

export const updateDeviceSchema = z.object({
  name: z.string().min(1).max(60).optional(),
  type: z.enum(['pc', 'console', 'vr', 'table']).optional(),
  status: z.enum(['available', 'in_use', 'reserved', 'offline']).optional(),
  hourly_rate: z.number().nonnegative().optional(),
  hourly_rate_multi: z.number().nonnegative().optional(),
  specs: z.record(z.unknown()).optional().nullable(),
  is_managed: z.boolean().optional(),
  device_number: z.number().int().positive().optional().nullable(),
});

export const generatePairingCodeSchema = z.object({
  device_id: z.string().min(1).optional().nullable(),
  ttl_minutes: z.number().int().min(1).max(60).optional().default(15),
});

export const agentPairRequestSchema = z.object({
  pairing_code: z.string().regex(/^\d{6}$/, 'Pairing code must be a 6-digit number'),
  device_number: z.number().int().positive().optional().nullable(),
  device_id: z.string().min(1).optional().nullable(),
  hostname: z.string().min(1).max(120).optional().default('PC-CLIENT'),
  hardware_fingerprint: z.string().min(8, 'Hardware fingerprint is required'),
  agent_public_key: z.string().min(8, 'Agent public key is required'),
  agent_version: z.string().optional().default('1.0.0'),
});

export const sendDeviceCommandSchema = z.object({
  command_type: z.enum([
    'SESSION_START_UNLOCK',
    'SESSION_UPDATE_TIME',
    'SESSION_PAUSE_LOCK',
    'SESSION_RESUME_UNLOCK',
    'SESSION_END_LOCK',
    'DISPLAY_MESSAGE',
    'SYSTEM_RESTART',
    'SYSTEM_SHUTDOWN',
    'ADMIN_MAINTENANCE_UNLOCK',
    'AGENT_UNPAIR_UNLOCK',
    'ENTER_MAINTENANCE',
    'EXIT_MAINTENANCE',
    'REVOKE_CREDENTIAL',
  ]),
  payload: z.record(z.unknown()).optional().default({}),
  session_id: z.string().optional().nullable(),
});

export const safePowerCommandSchema = z.object({
  action: z.enum(['restart', 'shutdown']),
  active_session_handling: z.enum(['keep_alive', 'end_and_bill']).optional().default('keep_alive'),
  reason: z.string().max(250).optional(),
});

export const bulkDeviceCommandSchema = z.object({
  device_ids: z.array(z.string().min(1)).optional(),
  command_type: z.enum([
    'SESSION_END_LOCK',
    'DISPLAY_MESSAGE',
    'SYSTEM_RESTART',
    'SYSTEM_SHUTDOWN',
    'ADMIN_MAINTENANCE_UNLOCK',
  ]),
  payload: z.record(z.unknown()).optional().default({}),
});

export const startSessionSchema = z.object({
  device_id: z.string().uuid('Valid device_id required'),
  customer_id: z.string().uuid().optional().nullable(),
  customer_username: z.string().regex(/^[a-zA-Z0-9_]+$/, 'Username must be alphanumeric and underscores only, no spaces').min(1).max(60).optional().nullable(),
  customer_name: z.string().max(120).optional().nullable(),
  customer_phone: z.string().max(40).optional(),
  session_type: z.enum(['open', 'fixed']).default('open'),
  play_mode: z.enum(['single', 'multiplayer']).default('single'),
  started_at: z.string().optional(),
  scheduled_end: z.string().optional(),
  hourly_rate_override: z.number().nonnegative().optional().nullable(),
  grace_period_minutes: z.number().int().nonnegative().default(0),
});

export const transferSessionSchema = z.object({
  target_device_id: z.string().uuid('Valid target_device_id required'),
  play_mode: z.enum(['single', 'multiplayer']).optional(),
  hourly_rate_override: z.number().nonnegative().optional().nullable(),
  session_type: z.enum(['open', 'fixed']).optional(),
  scheduled_end: z.string().optional().nullable(),
  duration_minutes: z.number().int().positive().optional().nullable(),
});

export const endSessionSchema = z.object({
  payment_method: z.enum(['cash', 'card', 'transfer', 'wallet']).optional(),
  mark_paid: z.boolean().optional(),
  ended_at: z.string().optional(),
  discount_type: z.enum(['none', 'percentage', 'fixed']).optional().default('none'),
  discount_value: z.number().nonnegative().optional().default(0),
  service_fee: z.number().nonnegative().optional().default(0),
  service_rate: z.number().nonnegative().optional().default(0),
  rounding_delta: z.number().optional().default(0),
  notes: z.string().max(500).optional().nullable(),
});

export const extendSessionSchema = z.object({
  additional_minutes: z.number().int().positive('Must extend by at least 1 minute'),
});

export const updateSessionSchema = z.object({
  started_at: z.string().optional(),
  scheduled_end: z.string().optional().nullable(),
  hourly_rate_override: z.number().nonnegative().optional().nullable(),
  grace_period_minutes: z.number().int().nonnegative().optional(),
});

export const payInvoiceSchema = z.object({
  payment_method: z.enum(['cash', 'card', 'transfer', 'wallet']).optional(),
});

export const createReservationSchema = z.object({
  device_id: z.string().uuid('Valid device_id required'),
  customer_id: z.string().uuid().optional().nullable(),
  customer_name: z.string().min(1).max(120).optional(),
  reserved_from: z.string(),
  reserved_until: z.string(),
  notes: z.string().max(500).optional(),
});

export const updateReservationSchema = z.object({
  status: z.enum(['pending', 'active', 'cancelled', 'completed']).optional(),
  notes: z.string().max(500).optional(),
  reserved_from: z.string().optional(),
  reserved_until: z.string().optional(),
});

export const createProductSchema = z.object({
  name: z.string().min(1, 'Name required').max(100),
  price: z.number().nonnegative('Price must be a positive number'),
  cost_price: z.number().nonnegative('Cost price must be non-negative').optional().nullable(),
  stock: z.number().int().nonnegative('Stock must be a non-negative integer').optional().default(0),
});

export const updateProductSchema = z.object({
  name: z.string().min(1, 'Name required').max(100).optional(),
  price: z.number().nonnegative('Price must be a positive number').optional(),
  cost_price: z.number().nonnegative('Cost price must be non-negative').optional().nullable(),
  stock: z.number().int().nonnegative('Stock must be a non-negative integer').optional(),
});

export const adjustStockSchema = z.object({
  delta: z.number().int('Delta must be an integer'),
  reason: z.string().max(200).optional(),
  category: z.enum(['restock', 'manual_adjustment', 'shrinkage']).optional().default('restock'),
});

export const createStandaloneSaleSchema = z.object({
  product_id: z.string().uuid('Valid product_id required'),
  quantity: z.number().int().positive('Quantity must be at least 1'),
  payment_method: z.enum(['cash', 'card', 'transfer', 'wallet']).optional().default('cash'),
});

export const addSessionOrderSchema = z.object({
  product_id: z.string().uuid('Valid product_id required'),
  quantity: z.number().int().positive('Quantity must be at least 1'),
});

export const pauseSessionSchema = z.object({
  reason: z.string().max(200).optional(),
});

export const createRoomSchema = z.object({
  name: z.string().min(1, 'Name required').max(100),
  icon: z.string().max(60).optional().default('sports_esports'),
  device_id: z.string().uuid().optional().nullable(),
  type: z.enum(['pc', 'console', 'vr', 'table']).optional().default('console'),
  hourly_rate: z.number().nonnegative().optional().default(20),
  hourly_rate_multi: z.number().nonnegative().optional().default(30),
});

export const updateRoomSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  icon: z.string().max(60).optional(),
  device_id: z.string().uuid().optional().nullable(),
  hourly_rate: z.number().nonnegative().optional(),
  hourly_rate_multi: z.number().nonnegative().optional(),
});

export const startShiftSchema = z.object({
  opening_cash: z.number().nonnegative('Opening cash must be non-negative').optional().default(0),
  notes: z.string().max(500).optional(),
});

export const closeShiftSchema = z.object({
  closing_cash: z.number().nonnegative('Closing cash must be non-negative').optional().nullable(),
  notes: z.string().max(500).optional(),
});

export const createExpenseSchema = z.object({
  amount: z.number().positive('Amount must be positive'),
  category: z.string().max(100).optional().default(''),
  description: z.string().min(1, 'Description required').max(300),
});

export const createCafeTableSchema = z.object({
  table_number: z.string().min(1, 'Table number required').max(50),
  name: z.string().min(1, 'Table name required').max(100),
  capacity: z.number().int().positive().optional().default(4),
  device_id: z.string().uuid().optional().nullable(),
});

export const updateCafeTableSchema = z.object({
  table_number: z.string().min(1).max(50).optional(),
  name: z.string().min(1).max(100).optional(),
  capacity: z.number().int().positive().optional(),
});

export const closeMonthSchema = z.object({
  closing_notes: z.string().max(1000).optional(),
  closing_balance: z.number().nonnegative().optional().default(0),
});

export const reopenMonthSchema = z.object({
  reason: z.string().max(500).optional(),
});




