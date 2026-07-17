import { MemoryRouter } from '@rspress/core/runtime';
import { act, cleanup, render, screen, within } from '@testing-library/react';
import type { ComponentProps, PropsWithChildren } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { projects } from '../../src/data/projects';
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
const globalProperties = [
  'ResizeObserver',
  'requestAnimationFrame',
  'cancelAnimationFrame',
] as const;
const originalGlobalDescriptors = new Map(
  globalProperties.map((property) => [
    property,
    Object.getOwnPropertyDescriptor(globalThis, property),
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

  for (const [property, descriptor] of originalGlobalDescriptors) {
    if (descriptor) {
      Object.defineProperty(globalThis, property, descriptor);
    } else {
      Reflect.deleteProperty(globalThis, property);
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

  it('observes every project tab and realigns after a preceding tab changes width', () => {
    let activeOffsetLeft = 280;
    let resizeCallback: ResizeObserverCallback | undefined;
    let frameCallback: FrameRequestCallback | undefined;
    const observe = vi.fn();
    const disconnect = vi.fn();
    const requestAnimationFrame = vi.fn((callback: FrameRequestCallback) => {
      frameCallback = callback;
      return 17;
    });
    const cancelAnimationFrame = vi.fn();

    class ResizeObserverMock {
      constructor(callback: ResizeObserverCallback) {
        resizeCallback = callback;
      }

      disconnect = disconnect;
      observe = observe;
      unobserve = vi.fn();
    }

    Object.defineProperties(globalThis, {
      ResizeObserver: {
        configurable: true,
        value: ResizeObserverMock,
      },
      cancelAnimationFrame: {
        configurable: true,
        value: cancelAnimationFrame,
      },
      requestAnimationFrame: {
        configurable: true,
        value: requestAnimationFrame,
      },
    });
    Object.defineProperties(HTMLElement.prototype, {
      clientWidth: {
        configurable: true,
        get: () => 400,
      },
      offsetLeft: {
        configurable: true,
        get() {
          return (this as HTMLElement).getAttribute('aria-current') === 'page'
            ? activeOffsetLeft
            : 0;
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
        get: () => 600,
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
    const projectTabs = Array.from(tabContainer?.children ?? []);
    const precedingTab = projectTabs[0];

    expect(tabContainer).not.toBeNull();
    expect(precedingTab).toBeInstanceOf(HTMLElement);
    expect(scrollTo).not.toHaveBeenCalled();
    expect(observe.mock.calls.map(([element]) => element)).toEqual([tabContainer, ...projectTabs]);

    activeOffsetLeft = 380;
    act(() => {
      resizeCallback?.([{ target: precedingTab } as ResizeObserverEntry], {} as ResizeObserver);
    });

    expect(requestAnimationFrame).toHaveBeenCalledOnce();
    expect(frameCallback).toBeTypeOf('function');

    act(() => {
      frameCallback?.(0);
    });

    expect(scrollTo).toHaveBeenCalledOnce();
    expect(scrollTo.mock.instances[0]).toBe(tabContainer);
    expect(scrollTo).toHaveBeenCalledWith({
      behavior: 'auto',
      left: 200,
    });
    expect(scrollIntoView).not.toHaveBeenCalled();
  });

  it('disconnects resize observation and cancels a pending alignment frame on cleanup', () => {
    let resizeCallback: ResizeObserverCallback | undefined;
    const disconnect = vi.fn();
    const cancelAnimationFrame = vi.fn();

    class ResizeObserverMock {
      constructor(callback: ResizeObserverCallback) {
        resizeCallback = callback;
      }

      disconnect = disconnect;
      observe = vi.fn();
      unobserve = vi.fn();
    }

    Object.defineProperties(globalThis, {
      ResizeObserver: {
        configurable: true,
        value: ResizeObserverMock,
      },
      cancelAnimationFrame: {
        configurable: true,
        value: cancelAnimationFrame,
      },
      requestAnimationFrame: {
        configurable: true,
        value: vi.fn(() => 23),
      },
    });

    const { unmount } = render(
      <MemoryRouter initialEntries={['/docs/fluctgraph/']}>
        <ProjectDocSwitcher />
      </MemoryRouter>,
    );

    act(() => {
      resizeCallback?.([], {} as ResizeObserver);
    });
    unmount();

    expect(disconnect).toHaveBeenCalledOnce();
    expect(cancelAnimationFrame).toHaveBeenCalledWith(23);
  });

  it('falls back to assigning a clamped scrollLeft when scrollTo is unavailable', () => {
    let assignedScrollLeft = 0;
    const setScrollLeft = vi.fn((value: number) => {
      assignedScrollLeft = value;
    });

    Object.defineProperties(HTMLElement.prototype, {
      clientWidth: {
        configurable: true,
        get: () => 100,
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
        get: () => assignedScrollLeft,
        set: setScrollLeft,
      },
      scrollTo: {
        configurable: true,
        value: undefined,
      },
      scrollWidth: {
        configurable: true,
        get: () => 320,
      },
    });

    render(
      <MemoryRouter initialEntries={['/docs/fluctgraph/']}>
        <ProjectDocSwitcher />
      </MemoryRouter>,
    );

    expect(setScrollLeft).toHaveBeenCalledOnce();
    expect(setScrollLeft).toHaveBeenCalledWith(220);
    expect(assignedScrollLeft).toBe(220);
    expect(scrollIntoView).not.toHaveBeenCalled();
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
