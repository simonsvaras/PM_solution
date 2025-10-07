export type ProjectCapacityStatusOption = {
  code: string;
  label: string;
  description?: string;
};

export const PROJECT_CAPACITY_STATUS_OPTIONS: ProjectCapacityStatusOption[] = [
  { code: 'SATURATED', label: 'Všechny pozice saturovány' },
  { code: 'SURPLUS_BE', label: 'Přebytek BE' },
  { code: 'SURPLUS_FE', label: 'Přebytek FE' },
  { code: 'SURPLUS_ANALYSIS', label: 'Přebytek Analysis' },
  { code: 'LACK_BE', label: 'Chybí kapacity na backend' },
  { code: 'LACK_FE', label: 'Chybí kapacity na frontend' },
  { code: 'LACK_ANALYSIS', label: 'Chybí kapacity na analýzu' },
  { code: 'CRITICAL', label: 'Kritický nedostatek kapacit' },
];
