import type { ToolConfig } from '@itsjust/core';

export const toolConfig: ToolConfig = {
  id: 'csv-cleaner',
  name: 'CSV Cleaner',
  description:
    'Clean and normalize messy CSV data: trim whitespace, fix headers, remove duplicate and empty rows, and preview the result.',
  version: '1.0.0',
  exportFormats: ['png', 'jpeg', 'webp', 'pdf', 'json'],
  features: {
    export: true,
    autoSave: true,
    undoRedo: true,
    sidebar: true,
    statusBar: true,
    darkMode: true,
  },
  theme: {
    accent: '#10b981',
    accentHover: '#059669',
    accentSubtle: 'rgba(16, 185, 129, 0.12)',
    brand: 'CSV Cleaner',
    icon: '🧹',
  },
  shortcuts: [
    {
      title: 'Actions',
      shortcuts: [
        {
          keys: 'C',
          label: 'Copy cleaned CSV',
          description: 'Copy the cleaned CSV to the clipboard',
        },
      ],
    },
  ],
};

export default toolConfig;
