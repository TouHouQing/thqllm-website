import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createRef } from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import { AccessibleTable } from '../components/mdx/AccessibleTable';
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

  it('makes markdown tables keyboard reachable while preserving table props and refs', async () => {
    const user = userEvent.setup();
    const tableRef = createRef<HTMLTableElement>();

    render(
      <>
        <AccessibleTable
          ref={tableRef}
          aria-label="版本矩阵"
          className="custom-table"
          data-source="markdown"
        >
          <tbody>
            <tr>
              <td>Codex</td>
            </tr>
          </tbody>
        </AccessibleTable>
        <AccessibleTable aria-label="端点矩阵">
          <tbody>
            <tr>
              <td>/v1</td>
            </tr>
          </tbody>
        </AccessibleTable>
      </>,
    );

    const table = screen.getByRole('table', { name: '版本矩阵' });
    const container = table.parentElement as HTMLElement;
    expect(container.tagName).toBe('DIV');
    expect(container).toHaveClass('rp-table-scroll-container', 'rp-scrollbar');
    expect(container).toHaveAttribute('tabindex', '0');
    expect(table).toHaveClass('custom-table');
    expect(table).toHaveAttribute('data-source', 'markdown');
    expect(tableRef.current).toBe(table);

    const secondTable = screen.getByRole('table', { name: '端点矩阵' });
    const secondContainer = secondTable.parentElement as HTMLElement;
    expect(secondContainer.tagName).toBe('DIV');
    expect(secondContainer).toHaveClass('rp-table-scroll-container', 'rp-scrollbar');
    expect(secondContainer).toHaveAttribute('tabindex', '0');

    expect(screen.getAllByRole('group', { name: '可横向滚动的表格' })).toEqual([
      container,
      secondContainer,
    ]);
    expect(screen.queryAllByRole('region')).toHaveLength(0);

    await user.tab();
    expect(container).toHaveFocus();
    await user.tab();
    expect(secondContainer).toHaveFocus();
  });
});
