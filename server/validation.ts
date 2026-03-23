import { z } from 'zod';

// Reject paths containing '..' to prevent directory traversal
export const safePath = z.string().min(1).refine(
  (p) => !p.split(/[\\/]/).includes('..'),
  { message: 'Path must not contain ".." segments' },
);

export const SpawnSessionSchema = z.object({
  cwd: safePath,
  prompt: z.string().min(1, 'Prompt is required'),
  permissionMode: z.enum(['autonomous', 'supervised']).default('autonomous'),
  name: z.string().max(100).optional(),
  includeContext: z.boolean().optional().default(false),
});

export const RenameSessionSchema = z.object({
  name: z.string().min(1).max(100),
});

export const UpdateClaudeMdSchema = z.object({
  cwd: safePath,
  content: z.string(),
});

export const SaveConfigSchema = z.object({
  defaultCwd: z.string().min(1),
  defaultPermissionMode: z.enum(['autonomous', 'supervised']),
  workingDirectories: z.array(z.object({
    label: z.string().min(1),
    path: z.string().min(1),
  })),
  vaultPath: z.string().default(''),
  maxSessions: z.number().int().min(1).max(20),
  approvalTimeoutMinutes: z.number().int().min(1).max(120).default(30),
});

// Re-export for config.ts usage
export const AppConfigSchema = SaveConfigSchema;

export const DirectoryQuerySchema = z.object({
  path: z.string().default('').refine(
    (p) => !p.split(/[\\/]/).includes('..'),
    { message: 'Path must not contain ".." segments' },
  ),
});

export type SpawnSessionInput = z.infer<typeof SpawnSessionSchema>;
export type AppConfig = z.infer<typeof AppConfigSchema>;
