/** A template only creates the plan and its days — you add your own exercises to each day. */
export type PlanTemplate = {
  name: string;
  description: string;
  days: string[];
};

export const PLAN_TEMPLATES: PlanTemplate[] = [
  {
    name: 'Arnold Split',
    description: '3 days · Chest & Back / Shoulders & Arms / Legs',
    days: ['Chest & Back', 'Shoulders & Arms', 'Legs'],
  },
  {
    name: 'Upper / Lower',
    description: '2 days · Upper body / Lower body',
    days: ['Upper', 'Lower'],
  },
];
