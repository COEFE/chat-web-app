# Dashboard Redesign Todo

## Objective
Redesign the dashboard to make documents the focal point by reducing space taken by favorites and upload sections.

## Design Principles
1. **Content First**: Documents should be the main focus
2. **Progressive Disclosure**: Hide secondary features until needed
3. **Spatial Efficiency**: Maximize screen real estate for document viewing
4. **Consistent Patterns**: Follow established UI patterns for familiarity

## Implementation Tasks

### 1. Collapsible Favorites Section
- [ ] Convert favorites section to a collapsible panel
- [ ] Add expand/collapse toggle button
- [ ] Show only section header and 2-3 favorites when collapsed
- [ ] Add "Show All" link when collapsed
- [ ] Save expanded/collapsed state in user preferences

### 2. Compact Header & Actions
- [ ] Move upload button to a more compact toolbar
- [ ] Combine similar actions into dropdown menus
- [ ] Use icon-only buttons with tooltips for common actions
- [ ] Add a "New" button with dropdown for all creation actions

### 3. Sidebar Navigation Improvements
- [ ] Consider moving folder navigation to a collapsible sidebar
- [ ] Add favorites as a section in the sidebar
- [ ] Implement a toggle to show/hide the sidebar

### 4. Responsive Layout Adjustments
- [ ] Ensure layout adapts well to different screen sizes
- [ ] On smaller screens, automatically collapse secondary sections
- [ ] Use responsive grid for document display

### 5. Visual Hierarchy Improvements
- [ ] Increase visual prominence of document cards/rows
- [ ] Reduce visual weight of secondary elements
- [ ] Use subtle backgrounds for secondary sections
- [ ] Ensure proper spacing between elements

## References
- [How to design better "favorites"](https://uxplanet.org/how-to-design-better-favorites-d1fe8f204a1)
- [Collapsible Sections Design Patterns](https://inclusive-components.design/collapsible-sections/)
- [Document Management Best Practices](https://theecmconsultant.com/document-management-best-practices/)
