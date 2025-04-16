# Button Reorganization Plan

## Current Issues
- Buttons are scattered across different areas of the interface
- No clear visual hierarchy or grouping
- Upload and folder creation buttons take up too much space
- Inconsistent button styles and sizes

## Design Principles
1. **Group related actions together** - Organize buttons by function (file operations, view controls, etc.)
2. **Use a consistent visual language** - Maintain consistent button sizes, styles, and spacing
3. **Implement progressive disclosure** - Hide less frequently used options in dropdown menus
4. **Prioritize by frequency of use** - Make common actions more accessible
5. **Use icons effectively** - Reduce text labels where icons are universally understood

## Implementation Plan

### 1. Create a Primary Action Button
- Implement a single "New" button with a dropdown menu containing:
  - New Folder
  - Upload Document
  - Other creation actions

### 2. Organize View Controls
- Group view-related controls together (list/grid toggle, grouping options)
- Use a compact toggle or segmented control for view switching
- Move sorting and filtering into a single dropdown

### 3. Implement a Toolbar Component
- Create a dedicated toolbar component with consistent styling
- Organize buttons into logical groups with subtle separators
- Use tooltips for icon-only buttons

### 4. Responsive Considerations
- On smaller screens, collapse text labels and show only icons
- Use an overflow menu for less frequently used actions
- Ensure touch targets are appropriately sized

## Visual References
- Modern document management interfaces use clean, minimal toolbars
- Button groups are visually distinct with subtle separators
- Primary actions use filled buttons, secondary actions use ghost/outline styles
- Icons are consistently sized and aligned
