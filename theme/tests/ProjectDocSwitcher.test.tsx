import { MemoryRouter } from '@rspress/core/runtime';
import { cleanup, render, screen, within } from '@testing-library/react';
import type { ComponentProps, PropsWithChildren } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { projects } from '../../src/data/projects';
import { DocProjectHeader } from '../components/DocProjectHeader';
import { ProjectDocSwitcher } from '../components/ProjectDocSwitcher';

const documentedProjects = projects.filter((project) => project.docs);
const prototypeProperties = [
  'clientWidth',
  'offsetLeft',
  'offsetWidth',
  'scrollIntoView',
  'scrollLeft',
  'scrollTo',
  'scrollWidth',
] as const;
const originalPrototypeDescriptors = new Map(
  prototypeProperties.map((property) => [
    property,
    Object.getOwnPropertyDescriptor(HTMLElement.prototype, property),
  ]),
);
const scrollIntoView = vi.fn();
const scrollTo = vi.fn();
const runtimeState = vi.hoisted(() => ({
  pathname: '/',
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
}));

vi.mock('@rspress/core/theme-original', () => ({
  Link: (props: ComponentProps<'a'>) => <a {...props} />,
}));

afterEach(() => {
  cleanup();

  for (const [property, descriptor] of originalPrototypeDescriptors) {
    if (descriptor) {
      Object.defineProperty(HTMLElement.prototype, property, descriptor);
    } else {
      Reflect.deleteProperty(HTMLElement.prototype, property);
    }
  }
});

describe('ProjectDocSwitcher', () => {
  beforeEach(() => {
    scrollIntoView.mockReset();
    scrollTo.mockReset();
    Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', {
      configurable: true,
      value: scrollIntoView,
    });
  });

  it('renders every documented project in registry order with the current project as a tab', () => {
    render(
      <MemoryRouter initialEntries={['/docs/thq-api/faq']}>
        <ProjectDocSwitcher />
      </MemoryRouter>,
    );

    const switcher = screen.getByRole('navigation', { name: '切换项目文档' });
    expect(within(switcher).getByText('PROJECT DOCS', { exact: true })).toBeInTheDocument();
    const projectTabs = switcher.querySelectorAll('a, [aria-current="page"]');

    expect(Array.from(projectTabs, (tab) => tab.textContent)).toEqual(
      documentedProjects.map((project) => project.name),
    );

    const currentTab = within(switcher).getByText('THQ API', {
      selector: '[aria-current="page"]',
    });
    expect(currentTab).toHaveAttribute('aria-current', 'page');
    expect(currentTab).not.toHaveAttribute('href');
    expect(within(switcher).queryByRole('link', { name: 'THQ API 文档' })).not.toBeInTheDocument();

    for (const project of documentedProjects.filter((project) => project.id !== 'thq-api')) {
      expect(within(switcher).getByRole('link', { name: `${project.name} 文档` })).toHaveAttribute(
        'href',
        project.docs?.basePath,
      );
    }

    expect(
      within(switcher).queryByRole('combobox', { name: '切换当前项目文档' }),
    ).not.toBeInTheDocument();
  });

  it('scrolls only the tab container to a clamped centered position', () => {
    Object.defineProperties(HTMLElement.prototype, {
      clientWidth: {
        configurable: true,
        get: () => 120,
      },
      offsetLeft: {
        configurable: true,
        get() {
          return (this as HTMLElement).getAttribute('aria-current') === 'page' ? 280 : 0;
        },
      },
      offsetWidth: {
        configurable: true,
        get: () => 100,
      },
      scrollLeft: {
        configurable: true,
        get: () => 0,
      },
      scrollTo: {
        configurable: true,
        value: scrollTo,
      },
      scrollWidth: {
        configurable: true,
        get: () => 320,
      },
    });

    render(
      <MemoryRouter initialEntries={['/docs/toho-image-studio/']}>
        <ProjectDocSwitcher />
      </MemoryRouter>,
    );

    const activeTab = screen.getByText('Toho Image Studio', {
      selector: '[aria-current="page"]',
    });
    const tabContainer = activeTab.parentElement;

    expect(tabContainer).not.toBeNull();
    expect(scrollTo).toHaveBeenCalledOnce();
    expect(scrollTo.mock.instances[0]).toBe(tabContainer);
    expect(scrollTo).toHaveBeenCalledWith({
      behavior: 'auto',
      left: 200,
    });
    expect(scrollIntoView).not.toHaveBeenCalled();
  });

  it('keeps working when container scrolling is unavailable in the test environment', () => {
    Object.defineProperty(HTMLElement.prototype, 'scrollTo', {
      configurable: true,
      value: undefined,
    });

    expect(() =>
      render(
        <MemoryRouter initialEntries={['/docs/fluctgraph/']}>
          <ProjectDocSwitcher />
        </MemoryRouter>,
      ),
    ).not.toThrow();

    expect(
      screen.getByText('FluctGraph', {
        selector: '[aria-current="page"]',
      }),
    ).toBeInTheDocument();
  });

  it('uses complete project names for every tab', () => {
    render(
      <MemoryRouter initialEntries={['/docs/toho-image-studio/']}>
        <ProjectDocSwitcher />
      </MemoryRouter>,
    );

    const switcher = screen.getByRole('navigation', { name: '切换项目文档' });
    for (const project of documentedProjects) {
      expect(within(switcher).getByText(project.name, { exact: true })).toBeInTheDocument();
    }
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
