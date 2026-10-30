import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation, useNavigate } from 'react-router';
import { afterEach, describe, expect, it } from 'vite-plus/test';
import { ROUTES, useGoBack } from './routes';

afterEach(cleanup);

function Page() {
  const back = useGoBack();
  const navigate = useNavigate();
  const { pathname } = useLocation();
  return (
    <>
      <p>at {pathname}</p>
      <button onClick={back}>back</button>
      <button onClick={() => void navigate(ROUTES.taxonomy)}>forward</button>
    </>
  );
}

const renderAt = (entries: string[]) =>
  render(
    <MemoryRouter initialEntries={entries}>
      <Routes>
        <Route path="*" element={<Page />} />
      </Routes>
    </MemoryRouter>,
  );

describe('useGoBack', () => {
  it('goes back one entry when the app has an earlier one', () => {
    renderAt(['/']);
    fireEvent.click(screen.getByText('forward'));
    expect(screen.getByText('at /taxonomy')).toBeTruthy();
    fireEvent.click(screen.getByText('back'));
    expect(screen.getByText('at /')).toBeTruthy();
  });

  it('replaces with the notes list when there is no earlier entry', () => {
    renderAt(['/taxonomy']);
    fireEvent.click(screen.getByText('back'));
    expect(screen.getByText('at /')).toBeTruthy();
    // replaced, not pushed: a second back stays on the notes list
    fireEvent.click(screen.getByText('back'));
    expect(screen.getByText('at /')).toBeTruthy();
  });
});
