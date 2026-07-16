import { z } from 'zod';

const humanReadableStringSchema = z
  .string()
  .refine((value) => value.trim().length > 0, {
    message: 'Human-readable strings must not be blank',
  })
  .refine((value) => value === value.trim(), {
    message: 'Human-readable strings must not include surrounding whitespace',
  });
const slugFormatSchema = z
  .string()
  .trim()
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);
const projectDocSlugFormatSchema = z
  .string()
  .trim()
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*(?:\/[a-z0-9]+(?:-[a-z0-9]+)*)*$/);

export const slugSchema = z
  .string()
  .refine((value) => value === value.trim(), {
    message: 'Slugs must not include surrounding whitespace',
  })
  .pipe(slugFormatSchema);

export const projectDocSlugSchema = z
  .string()
  .refine((value) => value === value.trim(), {
    message: 'Slugs must not include surrounding whitespace',
  })
  .pipe(projectDocSlugFormatSchema);

export const projectDocItemSchema = z
  .object({
    text: humanReadableStringSchema,
    slug: projectDocSlugSchema,
  })
  .strict();

export const projectDocSectionSchema = z
  .object({
    text: humanReadableStringSchema,
    items: z.array(projectDocItemSchema).nonempty(),
  })
  .strict();

const externalUrlSchema = z
  .string()
  .refine((value) => value === value.trim(), {
    message: 'Project URLs must not include surrounding whitespace',
  })
  .superRefine((value, context) => {
    if (value !== value.trim()) {
      return;
    }

    let parsedUrl: URL;

    try {
      parsedUrl = new URL(value);
    } catch {
      context.addIssue({
        code: 'custom',
        message: 'Project URLs must be valid absolute URLs',
      });
      return;
    }

    if (parsedUrl.protocol !== 'https:') {
      context.addIssue({
        code: 'custom',
        message: 'Project URLs must use HTTPS',
      });
    }

    if (parsedUrl.username || parsedUrl.password) {
      context.addIssue({
        code: 'custom',
        message: 'Project URLs must not include username or password credentials',
      });
    }

    if (parsedUrl.hostname.toLowerCase().replace(/\.$/, '') === 'thqllm.com') {
      context.addIssue({
        code: 'custom',
        message: 'Project URLs must not use the site hostname',
      });
    }
  });

function normalizeExternalUrl(value: string): string | undefined {
  if (value !== value.trim()) {
    return undefined;
  }

  try {
    return new URL(value).href;
  } catch {
    return undefined;
  }
}

export const projectSchema = z
  .object({
    id: slugSchema,
    name: humanReadableStringSchema,
    stageLabel: humanReadableStringSchema,
    categoryLabel: humanReadableStringSchema,
    description: humanReadableStringSchema.min(10),
    externalUrl: externalUrlSchema,
    docs: z
      .object({
        basePath: z.string().regex(/^\/docs\/[a-z0-9-]+\/$/),
        sections: z.array(projectDocSectionSchema).nonempty(),
      })
      .strict()
      .optional(),
    accent: z.enum(['vermilion', 'cyan', 'gold', 'sakura']),
    tags: z.array(humanReadableStringSchema).nonempty(),
    order: z.number().int().nonnegative(),
    featured: z.boolean(),
  })
  .strict()
  .superRefine((project, context) => {
    const docs = project.docs;

    if (!docs) {
      return;
    }

    const parsedProjectId = slugSchema.safeParse(project.id);
    if (parsedProjectId.success) {
      const expectedBasePath = `/docs/${parsedProjectId.data}/`;
      if (docs.basePath !== expectedBasePath) {
        context.addIssue({
          code: 'custom',
          message: `Project docs base path must match project id: ${expectedBasePath}`,
          path: ['docs', 'basePath'],
        });
      }
    }

    const itemSlugs = new Set<string>();
    let hasIndexItem = false;

    docs.sections.forEach((section, sectionIndex) => {
      section.items.forEach((item, itemIndex) => {
        if (itemSlugs.has(item.slug)) {
          context.addIssue({
            code: 'custom',
            message: `Duplicate project docs item slug: ${item.slug}`,
            path: ['docs', 'sections', sectionIndex, 'items', itemIndex, 'slug'],
          });
        }

        itemSlugs.add(item.slug);
        hasIndexItem ||= item.slug === 'index';
      });
    });

    if (!hasIndexItem) {
      context.addIssue({
        code: 'custom',
        message: 'Project docs must include an index item',
        path: ['docs', 'sections'],
      });
    }
  });

export const projectListSchema = z
  .array(projectSchema)
  .nonempty()
  .superRefine((projects, context) => {
    const ids = new Set<string>();
    const names = new Set<string>();
    const orders = new Set<number>();
    const docsBasePaths = new Set<string>();
    const externalUrls = new Set<string>();

    projects.forEach((project, index) => {
      if (ids.has(project.id)) {
        context.addIssue({
          code: 'custom',
          message: `Duplicate project id: ${project.id}`,
          path: [index, 'id'],
        });
      }

      if (names.has(project.name)) {
        context.addIssue({
          code: 'custom',
          message: `Duplicate project name: ${project.name}`,
          path: [index, 'name'],
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

      const normalizedExternalUrl = normalizeExternalUrl(project.externalUrl);

      if (normalizedExternalUrl !== undefined && externalUrls.has(normalizedExternalUrl)) {
        context.addIssue({
          code: 'custom',
          message: `Duplicate project external URL: ${normalizedExternalUrl}`,
          path: [index, 'externalUrl'],
        });
      }

      ids.add(project.id);
      names.add(project.name);
      orders.add(project.order);

      if (normalizedExternalUrl !== undefined) {
        externalUrls.add(normalizedExternalUrl);
      }
    });
  });

export type ProjectDefinition = z.infer<typeof projectSchema>;
export type ProjectDocSection = z.infer<typeof projectDocSectionSchema>;
