import { type ComponentProps, forwardRef } from 'react';

const scrollClass = 'rp-table-scroll-container rp-scrollbar';
const scrollLabel = '可横向滚动的表格';

export const AccessibleTable = forwardRef<HTMLTableElement, ComponentProps<'table'>>(
  (props, ref) => {
    return (
      // biome-ignore lint/a11y: Scrollable tables intentionally use a named, focusable non-landmark group.
      <div className={scrollClass} role="group" aria-label={scrollLabel} tabIndex={0}>
        <table ref={ref} {...props} />
      </div>
    );
  },
);
