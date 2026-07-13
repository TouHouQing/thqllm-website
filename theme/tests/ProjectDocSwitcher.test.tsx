import { MemoryRouter } from '@rspress/core/runtime';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ComponentProps, PropsWithChildren } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DocProjectHeader } from '../components/DocProjectHeader';
import { ProjectDocSwitcher } from '../components/ProjectDocSwitcher';

const runtimeState = vi.hoisted(() => ({
  pathname: '/',
  navigate: vi.fn(),
}));

// Rspress provides its virtual route modules only during the site build.
vi.mock('@rspress/core/runtime', () => ({
  MemoryRouter: ({
    children,
    initialEntries,
  }: PropsWithChildren<{ initialEntries?: string[] }>) => {
    runtimeState.pathname = initialEntries?.[0] ?? '/';
    return children;
  },
  useLocation: () => ({ pathname: runtimeState.pathname }),
  useNavigate: () => runtimeState.navigate,
}));

vi.mock('@rspress/core/theme-original', () => ({
  Link: (props: ComponentProps<'a'>) => <a {...props} />,
}));

afterEach(cleanup);

describe('ProjectDocSwitcher', () => {
  beforeEach(() => {
    runtimeState.navigate.mockReset();
  });

  it('shows the current project on a nested docs route', () => {
    render(
      <MemoryRouter initialEntries={['/docs/thq-api/faq']}>
        <ProjectDocSwitcher />
      </MemoryRouter>,
    );

    expect(screen.getByText('THQ API', { selector: 'strong' })).toBeInTheDocument();
    expect(screen.getByRole('combobox', { name: '切换当前项目文档' })).toHaveValue('thq-api');
    expect(screen.getByRole('link', { name: 'FluctGraph 文档' })).toHaveAttribute(
      'href',
      '/docs/fluctgraph/',
    );
  });

  it('navigates to the selected project docs', async () => {
    const user = userEvent.setup();
    render(
      <MemoryRouter initialEntries={['/docs/thq-api/faq']}>
        <ProjectDocSwitcher />
      </MemoryRouter>,
    );

    await user.selectOptions(
      screen.getByRole('combobox', { name: '切换当前项目文档' }),
      'fluctgraph',
    );

    expect(runtimeState.navigate).toHaveBeenCalledWith('/docs/fluctgraph/');
  });

  it('renders nothing outside docs routes', () => {
    const { container } = render(
      <MemoryRouter initialEntries={['/projects/']}>
        <ProjectDocSwitcher />
      </MemoryRouter>,
    );

    expect(container).toBeEmptyDOMElement();
  });
});

describe('DocProjectHeader', () => {
  it('shows project identity and a safe external link on docs routes', () => {
    render(
      <MemoryRouter initialEntries={['/docs/fluctgraph/quick-start']}>
        <DocProjectHeader />
      </MemoryRouter>,
    );

    expect(screen.getByText('STAGE 01 · KNOWLEDGE GRAPH')).toBeInTheDocument();
    expect(screen.getByText('FluctGraph', { selector: 'strong' })).toBeInTheDocument();
    expect(screen.getByText('打开项目')).toBeInTheDocument();
    const link = screen.getByRole('link', { name: '打开 FluctGraph' });
    expect(link).toHaveAttribute('href', 'https://graph.tohoqing.com/');
    expect(link).toHaveAttribute('target', '_blank');
    expect(link).toHaveAttribute('rel', 'noreferrer noopener');
  });
});
