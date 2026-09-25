import { describe, expect, it } from 'vitest';
import { classifyRemoteCommandRisk } from '../src/main/conteenua-cloud.js';

describe('Conteenua remote command approvals', () => {
  it('requires approval for git pushes', () => {
    expect(classifyRemoteCommandRisk(['git push origin fix/checkout'])).toEqual({
      category: 'git_push',
      summary: 'ChatGPT wants to push Git changes from this project.',
    });
  });

  it('requires approval for package installation', () => {
    expect(classifyRemoteCommandRisk(['npm install zod'])).toMatchObject({ category: 'package_install' });
    expect(classifyRemoteCommandRisk(['python -m pip install requests'])).toMatchObject({ category: 'package_install' });
  });

  it('requires approval for deployment and destructive commands', () => {
    expect(classifyRemoteCommandRisk(['vercel --prod'])).toMatchObject({ category: 'deployment' });
    expect(classifyRemoteCommandRisk(['git reset --hard HEAD~1'])).toMatchObject({ category: 'destructive_command' });
    expect(classifyRemoteCommandRisk(['Remove-Item .\\generated -Recurse -Force'])).toMatchObject({ category: 'bulk_delete' });
  });

  it('does not interrupt routine local development commands', () => {
    expect(classifyRemoteCommandRisk(['npm run typecheck'])).toBeNull();
    expect(classifyRemoteCommandRisk(['git status --short'])).toBeNull();
    expect(classifyRemoteCommandRisk(['rg -n "TODO" src'])).toBeNull();
  });
});
