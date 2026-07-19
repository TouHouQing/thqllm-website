import { Head, useLocation } from '@rspress/core/runtime';
import { projects } from '../../src/data/projects';
import { createSiteSeo, serializeStructuredData } from '../../src/lib/site-seo';

const socialImage = 'https://thqllm.com/og-cover.png';
const socialImageAlt = 'THQLLM 项目官网';

export function SiteSeo() {
  const { pathname } = useLocation();
  const seo = createSiteSeo(pathname, projects);

  return (
    <Head>
      <link rel="canonical" href={seo.canonicalUrl} />
      <meta name="robots" content={seo.robots} />
      <meta name="googlebot" content={seo.robots} />
      <meta property="og:url" content={seo.canonicalUrl} />
      <meta property="og:locale" content="zh_CN" />
      <meta property="og:image:alt" content={socialImageAlt} />
      <meta property="og:image:width" content="1200" />
      <meta property="og:image:height" content="630" />
      <meta name="twitter:image" content={socialImage} />
      <meta name="twitter:image:alt" content={socialImageAlt} />
      <script id="thqllm-structured-data" type="application/ld+json">
        {serializeStructuredData(seo.structuredData)}
      </script>
    </Head>
  );
}
