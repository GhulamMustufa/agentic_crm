import { render, screen, fireEvent } from '@testing-library/react'
import { EmptyState } from './empty-state'
import { AlertCircle } from 'lucide-react'
import { describe, it, expect, vi } from 'vitest'

describe('EmptyState', () => {
  it('renders the title and description correctly', () => {
    render(
      <EmptyState
        icon={AlertCircle}
        title="No data found"
        description="We couldn't find any data matching your criteria."
      />
    )

    expect(screen.getByText('No data found')).toBeDefined()
    expect(screen.getByText("We couldn't find any data matching your criteria.")).toBeDefined()
  })

  it('renders the action button when provided', () => {
    const handleAction = vi.fn()
    
    render(
      <EmptyState
        icon={AlertCircle}
        title="No data found"
        description="We couldn't find any data matching your criteria."
        actionLabel="Retry"
        onAction={handleAction}
      />
    )

    const button = screen.getByText('Retry')
    expect(button).toBeDefined()

    fireEvent.click(button)
    expect(handleAction).toHaveBeenCalledTimes(1)
  })
})
