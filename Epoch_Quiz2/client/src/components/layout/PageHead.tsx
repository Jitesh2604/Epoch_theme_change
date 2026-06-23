import React from 'react';

interface PageHeadProps {
  eyebrow?: React.ReactNode;
  title: React.ReactNode;
  body?: React.ReactNode;
  right?: React.ReactNode;
}

export const PageHead: React.FC<PageHeadProps> = ({ eyebrow, title, body, right }) => (
  <section className="page-head container">
    <div style={{ display: 'flex', gap: 24, alignItems: 'flex-end', flexWrap: 'wrap' }}>
      <div style={{ flex: 1, minWidth: 280 }}>
        {eyebrow && <div className="eyebrow"><span className="dot"></span>{eyebrow}</div>}
        <h1>{title}</h1>
        {body && <p>{body}</p>}
      </div>
      {right && <div>{right}</div>}
    </div>
  </section>
);
