import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { ApiEndpoint } from '../components/mdx/ApiEndpoint';
import { ParameterTable } from '../components/mdx/ParameterTable';
import { ProjectLink } from '../components/mdx/ProjectLink';

afterEach(cleanup);

describe('MDX components', () => {
  it('renders safe project links', () => {
    render(<ProjectLink href="https://example.com/">打开项目</ProjectLink>);

    const link = screen.getByRole('link', { name: '打开项目' });
    expect(link).toHaveAttribute('href', 'https://example.com/');
    expect(link).toHaveAttribute('target', '_blank');
    expect(link).toHaveAttribute('rel', 'noreferrer noopener');
  });

  it('renders an endpoint and accessible parameter table', () => {
    render(
      <>
        <ApiEndpoint method="post" path="/v1/example" />
        <ParameterTable
          rows={[
            {
              name: 'model',
              type: 'string',
              required: true,
              description: '模型标识。',
            },
          ]}
        />
      </>,
    );

    expect(screen.getByText('POST')).toBeInTheDocument();
    expect(screen.getByText('/v1/example')).toBeInTheDocument();
    expect(screen.getByRole('table')).toBeInTheDocument();
    expect(screen.getAllByRole('columnheader').map((header) => header.textContent)).toEqual([
      '参数',
      '类型',
      '必填',
      '说明',
    ]);
    expect(screen.getByRole('rowheader', { name: 'model' })).toBeInTheDocument();
    expect(screen.getByText('是')).toBeInTheDocument();
  });
});
