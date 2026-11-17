import { Router } from 'express';
import asyncHandler from 'express-async-handler';
import {
  discoverController,
  createPairingCode,
  pairAgentDevice,
  listAgentTelemetry,
  sendCommandToDevice,
  sendSafePowerCommand,
  unpairAgentDevice,
  toggleSimulatedAgent,
  sendBulkDeviceCommand,
  listDeviceAuditLogs,
} from '../controllers/agent.controller';
import {
  generatePairingCodeSchema,
  agentPairRequestSchema,
  sendDeviceCommandSchema,
  safePowerCommandSchema,
  bulkDeviceCommandSchema,
} from '../controllers/schemas';
import { validate } from '../middleware/validate';
import { verifyJWT } from '../middleware/auth';

const router = Router();

// Public LAN endpoints for Windows Agents during installation & pairing
router.get('/discover', asyncHandler(discoverController));
router.post('/pair', validate(agentPairRequestSchema), asyncHandler(pairAgentDevice));

// Authenticated Dashboard & Cashier endpoints
router.use(verifyJWT);

router.get('/telemetry', asyncHandler(listAgentTelemetry));
router.post('/pairing-code', validate(generatePairingCodeSchema), asyncHandler(createPairingCode));
router.post('/bulk-command', validate(bulkDeviceCommandSchema), asyncHandler(sendBulkDeviceCommand));

router.post('/devices/:id/command', validate(sendDeviceCommandSchema), asyncHandler(sendCommandToDevice));
router.post('/devices/:id/power', validate(safePowerCommandSchema), asyncHandler(sendSafePowerCommand));
router.post('/devices/:id/unpair', asyncHandler(unpairAgentDevice));
router.post('/devices/:id/simulate', asyncHandler(toggleSimulatedAgent));
router.get('/devices/:id/audit-logs', asyncHandler(listDeviceAuditLogs));

export default router;
