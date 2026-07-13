import { z } from 'zod';

export const slugSchema = z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);

export const projectDocItemSchema = z.object({
  text: z.string().min(1),
  slug: slugSchema,
});

export const projectDocSectionSchema = z.object({
  text: z.string().min(1),
  items: z.array(projectDocItemSchema).nonempty(),
});

export const projectSchema = z.object({
  id: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
  name: z.string().min(1),
  stageLabel: z.string().min(1),
  categoryLabel: z.string().min(1),
  description: z.string().min(10),
  externalUrl: z
    .string()
    .url()
    .refine((url) => url.startsWith('https://'), {
      message: 'Project URLs must use HTTPS',
    }),
  docs: z
    .object({
      basePath: z.string().regex(/^\/docs\/[a-z0-9-]+\/$/),
      sections: z.array(projectDocSectionSchema).nonempty(),
    })
    .optional(),
  accent: z.enum(['vermilion', 'cyan', 'gold', 'sakura']),
  tags: z.array(z.string().min(1)).nonempty(),
  order: z.number().int().nonnegative(),
  featured: z.boolean(),
});

export const projectListSchema = z
  .array(projectSchema)
  .nonempty()
  .superRefine((projects, context) => {
    const ids = new Set<string>();
    const orders = new Set<number>();
    const docsBasePaths = new Set<string>();

    projects.forEach((project, index) => {
      if (ids.has(project.id)) {
        context.addIssue({
          code: 'custom',
          message: `Duplicate project id: ${project.id}`,
          path: [index, 'id'],
        });
      }

      if (orders.has(project.order)) {
        context.addIssue({
          code: 'custom',
          message: `Duplicate project order: ${project.order}`,
          path: [index, 'order'],
        });
      }

      const docsBasePath = project.docs?.basePath;

      if (docsBasePath !== undefined) {
        if (docsBasePaths.has(docsBasePath)) {
          context.addIssue({
            code: 'custom',
            message: `Duplicate project docs base path: ${docsBasePath}`,
            path: [index, 'docs', 'basePath'],
          });
        }

        docsBasePaths.add(docsBasePath);
      }

      ids.add(project.id);
      orders.add(project.order);
    });
  });

export type ProjectDefinition = z.infer<typeof projectSchema>;
export type ProjectDocSection = z.infer<typeof projectDocSectionSchema>;
