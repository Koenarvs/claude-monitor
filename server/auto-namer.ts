import { basename } from 'path';

export function generateName(cwd: string, prompt: string): string {
  const dir = basename(cwd) || 'session';
  const summary = prompt.slice(0, 40).replace(/\n/g, ' ').trim();
  const name = `${dir}: ${summary}`;
  return name.length > 50 ? name.slice(0, 47) + '...' : name;
}

export function generateInitials(cwd: string): string {
  const dir = basename(cwd) || 'CC';
  const words = dir.split(/[-_\s]+/).filter(Boolean);
  if (words.length >= 2) {
    return (words[0][0] + words[1][0]).toUpperCase();
  }
  return dir.slice(0, 2).toUpperCase();
}
