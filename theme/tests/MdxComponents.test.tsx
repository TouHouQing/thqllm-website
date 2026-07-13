import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
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

  it('renders an endpoint and accessible parameter table', async () => {
    const user = userEvent.setup();
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
    const region = screen.getByRole('region', { name: '参数说明' });
    expect(region).toHaveAttribute('tabindex', '0');
    await user.tab();
    expect(region).toHaveFocus();
    const table = screen.getByRole('table', { name: '参数说明' });
    expect(within(table).getByText('参数说明', { selector: 'caption' })).toBeInTheDocument();
    expect(screen.getAllByRole('columnheader').map((header) => header.textContent)).toEqual([
      '参数',
      '类型',
      '必填',
      '说明',
    ]);
    expect(screen.getByRole('rowheader', { name: 'model' })).toBeInTheDocument();
    expect(screen.getByText('是')).toBeInTheDocument();
  });

  it('uses a custom parameter table caption', () => {
    render(<ParameterTable caption="请求参数" rows={[]} />);

    expect(screen.getByRole('region', { name: '请求参数' })).toBeInTheDocument();
    expect(screen.getByRole('table', { name: '请求参数' })).toBeInTheDocument();
  });
});
