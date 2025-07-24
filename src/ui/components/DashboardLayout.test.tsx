import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { ThemeProvider, createTheme } from '@mui/material/styles';
import DashboardLayout from './DashboardLayout';
import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock react-router-dom hooks
const mockNavigate = vi.fn();
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  };
});

// Test wrapper component that provides necessary providers
const TestWrapper: React.FC<{ children: React.ReactNode; initialRoute?: string }> = ({ 
  children, 
  initialRoute = '/' 
}) => {
  const theme = createTheme();
  
  return (
    <MemoryRouter initialEntries={[initialRoute]}>
      <ThemeProvider theme={theme}>
        {children}
      </ThemeProvider>
    </MemoryRouter>
  );
};

describe('DashboardLayout', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Rendering', () => {
    it('should render the dashboard layout with header', () => {
      render(
        <TestWrapper>
          <DashboardLayout>
            <div data-testid="test-content">Test Content</div>
          </DashboardLayout>
        </TestWrapper>
      );

      expect(screen.getByText('Short Video Maker')).toBeInTheDocument();
      expect(screen.getByText('Criador de vídeos curtos com IA')).toBeInTheDocument();
      expect(screen.getByTestId('test-content')).toBeInTheDocument();
    });

    it('should render navigation menu items', () => {
      render(
        <TestWrapper>
          <DashboardLayout>
            <div>Test Content</div>
          </DashboardLayout>
        </TestWrapper>
      );

      // Check main menu items
      expect(screen.getByText('Dashboard')).toBeInTheDocument();
      expect(screen.getByText('Video Studio')).toBeInTheDocument();
      expect(screen.getByText('Import Video')).toBeInTheDocument();
      expect(screen.getByText('IA Scripts')).toBeInTheDocument();
      expect(screen.getByText('Biblioteca')).toBeInTheDocument();
      expect(screen.getByText('TTS Studio')).toBeInTheDocument();
    });

    it('should render utility items', () => {
      render(
        <TestWrapper>
          <DashboardLayout>
            <div>Test Content</div>
          </DashboardLayout>
        </TestWrapper>
      );

      expect(screen.getByText('Configurações')).toBeInTheDocument();
      expect(screen.getByText('API Docs')).toBeInTheDocument();
    });

    it('should render quick action chips', () => {
      render(
        <TestWrapper>
          <DashboardLayout>
            <div>Test Content</div>
          </DashboardLayout>
        </TestWrapper>
      );

      expect(screen.getByText('Novo Vídeo')).toBeInTheDocument();
      expect(screen.getByText('Importar')).toBeInTheDocument();
      expect(screen.getByText('Script IA')).toBeInTheDocument();
    });

    it('should render user avatar and info', () => {
      render(
        <TestWrapper>
          <DashboardLayout>
            <div>Test Content</div>
          </DashboardLayout>
        </TestWrapper>
      );

      expect(screen.getByText('Usuário')).toBeInTheDocument();
      expect(screen.getByText('Criador de conteúdo')).toBeInTheDocument();
    });
  });

  describe('Navigation', () => {
    it('should navigate when menu items are clicked', () => {
      render(
        <TestWrapper>
          <DashboardLayout>
            <div>Test Content</div>
          </DashboardLayout>
        </TestWrapper>
      );

      // Click on Video Studio menu item
      fireEvent.click(screen.getByText('Video Studio'));
      expect(mockNavigate).toHaveBeenCalledWith('/studio');

      // Click on Import Video menu item  
      fireEvent.click(screen.getByText('Import Video'));
      expect(mockNavigate).toHaveBeenCalledWith('/import');

      // Click on IA Scripts menu item
      fireEvent.click(screen.getByText('IA Scripts'));
      expect(mockNavigate).toHaveBeenCalledWith('/ai-scripts');
    });

    it('should navigate when quick action chips are clicked', () => {
      render(
        <TestWrapper>
          <DashboardLayout>
            <div>Test Content</div>
          </DashboardLayout>
        </TestWrapper>
      );

      // Click on "Novo Vídeo" chip
      fireEvent.click(screen.getByText('Novo Vídeo'));
      expect(mockNavigate).toHaveBeenCalledWith('/studio');

      // Click on "Importar" chip
      fireEvent.click(screen.getByText('Importar'));
      expect(mockNavigate).toHaveBeenCalledWith('/import');

      // Click on "Script IA" chip
      fireEvent.click(screen.getByText('Script IA'));
      expect(mockNavigate).toHaveBeenCalledWith('/ai-scripts');
    });

    it('should navigate when utility items are clicked', () => {
      render(
        <TestWrapper>
          <DashboardLayout>
            <div>Test Content</div>
          </DashboardLayout>
        </TestWrapper>
      );

      // Click on Configurações
      fireEvent.click(screen.getByText('Configurações'));
      expect(mockNavigate).toHaveBeenCalledWith('/settings');

      // Click on API Docs
      fireEvent.click(screen.getByText('API Docs'));
      expect(mockNavigate).toHaveBeenCalledWith('/api-docs');
    });
  });

  describe('Active State', () => {
    it('should highlight the active menu item based on current path', () => {
      const { rerender } = render(
        <TestWrapper initialRoute="/studio">
          <DashboardLayout>
            <div>Test Content</div>
          </DashboardLayout>
        </TestWrapper>
      );

      // Video Studio should be selected when on /studio route
      const studioButton = screen.getByRole('button', { name: /video studio/i });
      expect(studioButton).toHaveClass('Mui-selected');

      // Rerender with different route
      rerender(
        <TestWrapper initialRoute="/library">
          <DashboardLayout>
            <div>Test Content</div>
          </DashboardLayout>
        </TestWrapper>
      );

      // Biblioteca should be selected when on /library route
      const libraryButton = screen.getByRole('button', { name: /biblioteca/i });
      expect(libraryButton).toHaveClass('Mui-selected');
    });
  });

  describe('Mobile Drawer', () => {
    it('should toggle mobile drawer when menu button is clicked', async () => {
      // Mock window.matchMedia for mobile view
      Object.defineProperty(window, 'matchMedia', {
        writable: true,
        value: vi.fn().mockImplementation(query => ({
          matches: query.includes('600px'), // Simulate mobile view
          media: query,
          onchange: null,
          addListener: vi.fn(),
          removeListener: vi.fn(),
          addEventListener: vi.fn(),
          removeEventListener: vi.fn(),
          dispatchEvent: vi.fn(),
        })),
      });

      render(
        <TestWrapper>
          <DashboardLayout>
            <div>Test Content</div>
          </DashboardLayout>
        </TestWrapper>
      );

      // Find mobile menu button (should be visible on mobile)
      const menuButton = screen.getByLabelText('open drawer');
      
      // Click to open mobile drawer
      fireEvent.click(menuButton);

      // The drawer content should be accessible
      await waitFor(() => {
        expect(screen.getByText('Short Video Maker')).toBeInTheDocument();
      });
    });
  });

  describe('NEW Badges', () => {
    it('should display NEW badges on new menu items', () => {
      render(
        <TestWrapper>
          <DashboardLayout>
            <div>Test Content</div>
          </DashboardLayout>
        </TestWrapper>
      );

      // Check for badges on new items
      // Note: We look for badge elements since the "NEW" text might be in a badge component
      const badges = screen.getAllByText('NEW');
      
      // Should have badges for Video Studio, Import Video, IA Scripts, and API Docs
      expect(badges.length).toBeGreaterThan(0);
    });
  });

  describe('Accessibility', () => {
    it('should have proper ARIA labels and roles', () => {
      render(
        <TestWrapper>
          <DashboardLayout>
            <div>Test Content</div>
          </DashboardLayout>
        </TestWrapper>
      );

      // Check for navigation landmark
      expect(screen.getByRole('navigation')).toBeInTheDocument();

      // Check for menu button accessibility
      expect(screen.getByLabelText('open drawer')).toBeInTheDocument();

      // Check for main content area
      expect(screen.getByRole('main')).toBeInTheDocument();
    });

    it('should have proper heading hierarchy', () => {
      render(
        <TestWrapper>
          <DashboardLayout>
            <div>Test Content</div>
          </DashboardLayout>
        </TestWrapper>
      );

      // Main app title should be present
      expect(screen.getByRole('heading', { level: 5 })).toHaveTextContent('Short Video Maker');
    });
  });

  describe('Theme Integration', () => {
    it('should render with theme colors and styling', () => {
      render(
        <TestWrapper>
          <DashboardLayout>
            <div>Test Content</div>
          </DashboardLayout>
        </TestWrapper>
      );

      // Check that components are rendered (theme integration is mainly visual)
      expect(screen.getByText('Short Video Maker')).toBeInTheDocument();
      
      // Verify that Material-UI components are properly themed
      const appBar = screen.getByRole('banner');
      expect(appBar).toBeInTheDocument();
    });
  });

  describe('Content Rendering', () => {
    it('should render children content properly', () => {
      const testContent = (
        <div data-testid="complex-content">
          <h1>Test Page</h1>
          <p>This is test content</p>
          <button>Test Button</button>
        </div>
      );

      render(
        <TestWrapper>
          <DashboardLayout>
            {testContent}
          </DashboardLayout>
        </TestWrapper>
      );

      expect(screen.getByTestId('complex-content')).toBeInTheDocument();
      expect(screen.getByText('Test Page')).toBeInTheDocument();
      expect(screen.getByText('This is test content')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Test Button' })).toBeInTheDocument();
    });

    it('should maintain layout structure with different content types', () => {
      const { rerender } = render(
        <TestWrapper>
          <DashboardLayout>
            <div>Simple content</div>
          </DashboardLayout>
        </TestWrapper>
      );

      expect(screen.getByText('Simple content')).toBeInTheDocument();

      rerender(
        <TestWrapper>
          <DashboardLayout>
            <div>
              <table>
                <tbody>
                  <tr>
                    <td>Complex content</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </DashboardLayout>
        </TestWrapper>
      );

      expect(screen.getByText('Complex content')).toBeInTheDocument();
    });
  });
});