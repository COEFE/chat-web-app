// frontend/src/components/dashboard/__mocks__/PDFViewerMock.js
import React from 'react';

// Simple mock for the PDFViewer component
const PDFViewerMock = ({ fileUrl, fileName }) => {
  return <div data-testid="pdf-viewer-mock">Mock PDF Viewer for: {fileName || 'Document'} ({fileUrl})</div>;
};

export default PDFViewerMock;
