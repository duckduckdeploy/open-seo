"use client";

import { type ReactNode, useState } from "react";
import { TabPanel, Tabs as TabList } from "@/components/tracking/kit";

export type TabItem<K extends string> = { key: K; label: string; content: ReactNode };

/**
 * Tabs with their panels, on the shared tab list (arrow keys, Home/End). A panel mounts the
 * first time its tab is opened and then stays mounted, so a paid result is not thrown away
 * when the user switches tabs.
 */
export function Tabs<K extends string>({ items, active, onChange, label }: { items: TabItem<K>[]; active: K; onChange: (key: K) => void; label: string }) {
  const [visited, setVisited] = useState<ReadonlySet<string>>(() => new Set([active]));
  if (!visited.has(active)) setVisited(new Set([...visited, active]));

  return (
    <div>
      <TabList label={label} value={active} onChange={onChange} tabs={items.map((item) => ({ id: item.key, label: item.label }))} />
      {items.map((item) => (
        <TabPanel key={item.key} id={item.key} hidden={item.key !== active}>
          {visited.has(item.key) && item.content}
        </TabPanel>
      ))}
    </div>
  );
}
