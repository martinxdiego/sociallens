import fs from 'node:fs';
import path from 'node:path';
import type { Plugin } from 'vite';

/** Include the exact notices of the dependencies that Rollup actually ships. */
export function sociallensLicenses(root: string): Plugin {
  return {
    name: 'sociallens-license-notices',
    generateBundle(_options, bundle) {
      const packages = new Set<string>();
      for (const output of Object.values(bundle)) {
        if (output.type !== 'chunk') continue;
        for (const moduleId of Object.keys(output.modules)) {
          const match = /^(.*\/node_modules\/(?:@[^/]+\/)?[^/]+)/.exec(moduleId.replace(/^\0+/, ''));
          if (match) packages.add(match[1]!);
        }
      }
      const sections = ['SocialLens — third-party notices\n\nSafeUnfollow upstream\n' + fs.readFileSync(path.join(root, 'LICENSE'), 'utf8')];
      for (const directory of [...packages].sort()) {
        const metadata = JSON.parse(fs.readFileSync(path.join(directory, 'package.json'), 'utf8'));
        const files = fs.readdirSync(directory).filter(name => /^(licen[sc]e|copying|ofl|notice)(\.|$|-)/i.test(name) && fs.statSync(path.join(directory, name)).isFile());
        const license = files.map(name => `${name}\n${fs.readFileSync(path.join(directory, name), 'utf8')}`).join('\n\n');
        const fallback = path.join(root, 'docs/_sociallens/licenses', metadata.name + '.txt');
        const text = license || (fs.existsSync(fallback) ? fs.readFileSync(fallback, 'utf8') : '');
        if (!text) throw new Error(`Missing bundled license text for ${metadata.name}`);
        const source = typeof metadata.repository === 'string' ? metadata.repository : metadata.repository?.url;
        sections.push(`${metadata.name}@${metadata.version}\nLicense: ${metadata.license}\nSource: ${source ?? metadata.homepage ?? ''}\n\n${text}`);
      }
      this.emitFile({ type: 'asset', fileName: 'THIRD_PARTY_NOTICES.txt', source: sections.join('\n\n' + '='.repeat(72) + '\n\n') });
    },
  };
}
