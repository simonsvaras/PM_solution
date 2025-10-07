export type ProjectCapacityStatusOption = {
  code: string;
  label: string;
  description?: string;
};

export type ProjectCapacityStatusSection = {
  id: 'general' | 'surplus' | 'lack';
  title?: string;
  options: ProjectCapacityStatusOption[];
};

export const PROJECT_CAPACITY_STATUS_SECTIONS: ProjectCapacityStatusSection[] = [
  {
    id: 'general',
    options: [
      { code: 'SATURATED', label: 'Vše saturováno' },
      { code: 'CRITICAL', label: 'Kritický nedostatek' },
    ],
  },
  {
    id: 'surplus',
    title: 'Přebytek',
    options: [
      { code: 'SURPLUS_FE', label: 'Přebytek FE' },
      { code: 'SURPLUS_ANALYSIS', label: 'Přebytek analýza' },
      { code: 'SURPLUS_BE', label: 'Přebytek BE' },
    ],
  },
  {
    id: 'lack',
    title: 'Nedostatek',
    options: [
      { code: 'LACK_FE', label: 'Nedostatek FE' },
      { code: 'LACK_BE', label: 'Nedostatek BE' },
      { code: 'LACK_ANALYSIS', label: 'Nedostatek analýza' },
    ],
  },
];

export const PROJECT_CAPACITY_STATUS_OPTIONS: ProjectCapacityStatusOption[] = PROJECT_CAPACITY_STATUS_SECTIONS.flatMap(
  section => section.options,
);

const STATUS_CODE_TO_SECTION_ID = new Map<string, ProjectCapacityStatusSection['id']>();

for (const section of PROJECT_CAPACITY_STATUS_SECTIONS) {
  for (const option of section.options) {
    STATUS_CODE_TO_SECTION_ID.set(option.code, section.id);
  }
}

export function getProjectCapacityStatusSectionId(
  code: string,
): ProjectCapacityStatusSection['id'] | undefined {
  return STATUS_CODE_TO_SECTION_ID.get(code);
}
