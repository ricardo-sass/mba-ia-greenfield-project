#!/usr/bin/env python3
"""Validate the independent Codex migration; no network or application dependencies."""
import argparse
import hashlib
import json
import re
import sys
import tomllib
from pathlib import Path


def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def snapshot(roots, root):
    result = {}
    for name in roots:
        base = root / name
        paths = sorted(base.rglob('*')) if base.is_dir() else [base]
        for path in paths:
            key = str(path.relative_to(root))
            if path.is_symlink():
                result[key] = {'type': 'symlink', 'target': str(path.readlink())}
            elif path.is_file():
                result[key] = {'type': 'file', 'sha256': digest(path)}
            elif path.is_dir():
                result[key] = {'type': 'directory'}
    return result


def glob_regex(pattern):
    """Repository paths: * excludes slash; **/ includes zero directories."""
    out = ''
    i = 0
    while i < len(pattern):
        if pattern[i:i+3] == '**/':
            out += '(?:.*/)?'
            i += 3
        elif pattern[i:i+2] == '**':
            out += '.*'
            i += 2
        elif pattern[i] == '*':
            out += '[^/]*'
            i += 1
        elif pattern[i] == '?':
            out += '[^/]'
            i += 1
        else:
            out += re.escape(pattern[i])
            i += 1
    return re.compile('^' + out + '$')


def markdown_prose(content):
    """Exclude fenced examples, including indented and tilde fences."""
    lines = []
    fence = None
    for line in content.splitlines():
        marker = re.match(r'^\s*(`{3,}|~{3,})(.*)$', line)
        if fence:
            if marker and marker[1][0] == fence[0] and len(marker[1]) >= len(fence) and not marker[2].strip():
                fence = None
        elif marker:
            fence = marker[1]
        else:
            lines.append(line)
    return '\n'.join(lines)


def relative_resource_checks(root, path, content):
    """Check inline skill resources without treating generated outputs as inputs."""
    skills_root = root / '.codex/skills'
    skill_names = {p.name for p in skills_root.iterdir() if p.is_dir()}
    skill_root = None
    if path.is_relative_to(skills_root):
        skill_root = skills_root / path.relative_to(skills_root).parts[0]
    # These literal paths describe files the generator will create, not its inputs.
    generated_examples = {
        'artifacts/entities.md', 'references/external-systems.md',
        'references/file-conventions.md', 'references/gotchas.md',
        'references/mock-health-rules.md',
    } if path == skills_root / 'generate-test-guide/SKILL.md' else set()
    prose = markdown_prose(content)
    # Double-backtick spans demonstrate inline-code syntax; they are examples too.
    prose = re.sub(r'(?<!`)(`{2,})(.*?)\1(?!`)', '', prose)
    for target in re.findall(r'(?<!`)`([^`\n]+)`(?!`)', prose):
        if not re.fullmatch(r'[\w./-]+(?:#[\w-]+)?(?::\d+)?', target):
            continue
        target = re.sub(r':\d+$', '', target.split('#')[0])
        if '/' not in target or not Path(target).suffix:
            continue
        prefix = target.split('/')[0]
        if prefix in skill_names:
            candidates = [skills_root / target]
        elif target.startswith(('./', '../')):
            candidates = [path.parent / target]
        elif skill_root and prefix in {'references', 'artifacts', 'templates', 'scripts'}:
            if target in generated_examples:
                continue
            candidates = [path.parent / target]
            candidates.append(skill_root / target)
        else:
            continue  # Product artifacts and repository-root paths have separate checks.
        yield (any(p.is_file() for p in candidates),
               f'Broken relative resource reference: {path.relative_to(root)} -> {target}')


def validate(root):
    errors = []
    checks = 0

    def check(condition, message):
        nonlocal checks
        checks += 1
        if not condition:
            errors.append(message)

    baseline = json.loads((root / 'docs/codex/baseline.json').read_text())
    migration = json.loads((root / 'docs/codex/migration-map.json').read_text())
    current = snapshot(baseline['protected_roots'], root)
    for key in sorted(set(current) | set(baseline['protected'])):
        check(current.get(key) == baseline['protected'].get(key), 'Protected baseline mismatch: ' + key)
    entries = migration['entries']
    mapped = {e['source'] for e in entries}
    expected = set()
    for directory in ['.claude/skills', '.claude/agents', '.claude/rules', '.claude/commands']:
        expected.update(str(p.relative_to(root)) for p in (root / directory).rglob('*') if p.is_file())
    expected.update(['CLAUDE.md', 'nestjs-project/CLAUDE.md', 'next-frontend/CLAUDE.md', '.claude/settings.json', '.mcp.json.example'])
    check(mapped == expected, 'Inventory source coverage differs: ' + str(sorted(mapped ^ expected)))
    check(len(entries) == len(mapped), 'Duplicate inventory source')
    for entry in entries:
        src, dest = root / entry['source'], root / entry['destination']
        check(src.is_file() and digest(src) == entry['source_sha256'], 'Source drift: ' + entry['source'])
        check(dest.is_file(), 'Missing destination: ' + entry['destination'])
        check(bool(entry['adaptation']), 'Missing adaptation: ' + entry['source'])

    skills = sorted((root / '.codex/skills').glob('*/SKILL.md'))
    check(len(skills) == 27, 'Expected 27 skills')
    names = []
    for path in skills:
        content = path.read_text()
        parts = content.split('---', 2)
        check(len(parts) == 3 and not parts[0].strip(), 'Missing frontmatter: ' + str(path))
        if len(parts) != 3:
            continue
        name = re.search(r'^name:\s*([a-z0-9-]+)\s*$', parts[1], re.M)
        check(name is not None, 'Invalid skill name: ' + str(path))
        if name:
            names.append(name[1])
            check(name[1] == path.parent.name, 'Skill directory/name mismatch: ' + str(path))
        check(bool(re.search(r'^description:\s*\S', parts[1], re.M)), 'Missing description: ' + str(path))
        link = root / '.agents/skills' / path.parent.name
        check(link.is_symlink() and link.resolve() == path.parent.resolve(), 'Invalid discovery link: ' + str(link))
        source = root / '.claude/skills' / path.parent.name
        for resource in source.rglob('*'):
            if resource.is_file():
                check((path.parent / resource.relative_to(source)).is_file(), 'Missing auxiliary resource: ' + str(resource))
    check(len(set(names)) == 27, 'Duplicate skill names')
    check(len(list((root / '.agents/skills').iterdir())) == 27, 'Unexpected discovery entries')

    agents = sorted((root / '.codex/agents').glob('*.toml'))
    check(len(agents) == 6, 'Expected six agents')
    for path in agents:
        data = tomllib.loads(path.read_text())
        check(all(data.get(k) for k in ['name', 'description', 'developer_instructions']), 'Incomplete agent: ' + path.name)
        check(data.get('sandbox_mode') == 'read-only', 'Reader is not read-only: ' + path.name)
        check(not {'model', 'model_reasoning_effort'} & data.keys(), 'Reader overrides user model: ' + path.name)
        check(data['name'] == path.stem, 'Agent filename/name mismatch: ' + path.name)
    config = tomllib.loads((root / 'docs/codex/config.example.toml').read_text())
    check(set(config['mcp_servers']) == {'context7', 'figma', 'postgres'}, 'Missing MCP example')
    check(all(s.get('enabled') is False for s in config['mcp_servers'].values()), 'MCP example enables a server')

    routes = {}
    root_guidance = (root / 'AGENTS.md').read_text()
    for sub in ['nestjs-project', 'next-frontend']:
        check(sub + '/AGENTS.md' in root_guidance, 'Root does not route subproject: ' + sub)
        guidance = (root / sub / 'AGENTS.md').read_text()
        check(len((root_guidance + guidance).encode()) <= 32768, 'Instruction chain exceeds default limit: ' + sub)
        routes[sub] = guidance
    rules = sorted((root / '.claude/rules').glob('*.md'))
    check(len(rules) == 17, 'Expected 17 source rules')
    routing = {}
    for source in rules:
        patterns = re.findall(r"^  - '(.+)'", source.read_text(), re.M)
        dest = root / 'docs/codex/rules' / source.name
        check(re.findall(r"^  - '(.+)'", dest.read_text(), re.M) == patterns, 'Rule scope changed: ' + source.name)
        routing[source.name] = patterns
        for pattern in patterns:
            row = f'| `{pattern}` | `docs/codex/rules/{source.name}` |'
            check(row in routes[pattern.split('/')[0]], 'Missing route: ' + row)
            matcher = glob_regex(pattern)
            for prefix in ['', 'nested/']:
                sample = pattern.replace('**/', prefix).replace('**', 'sample/file').replace('*', 'example')
                check(bool(matcher.fullmatch(sample)), 'Positive routing failure: ' + pattern)
                check(not matcher.fullmatch('unrelated/' + sample), 'Negative routing failure: ' + pattern)
    def matched(path):
        return {name for name, patterns in routing.items() if any(glob_regex(p).fullmatch(path) for p in patterns)}
    check(matched('nestjs-project/src/videos/videos.controller.ts') == {'nestjs-common-conventions.md', 'nestjs-controllers.md', 'nestjs-layer-separation.md', 'typescript-strict.md'}, 'Controller routing regression')
    check(matched('next-frontend/mocks/handlers.ts') == {'next-frontend-msw-mocks.md', 'next-frontend-code-quality.md'}, 'Mock routing regression')

    operational = list((root / '.codex/skills').rglob('*.md')) + list((root / '.codex/agents').glob('*.toml')) + list((root / 'docs/codex/rules').glob('*.md')) + [root / p for p in ['AGENTS.md', 'nestjs-project/AGENTS.md', 'next-frontend/AGENTS.md']]
    forbidden = re.compile(r'\.claude/|CLAUDE\.md|CLAUDE_PLUGIN_ROOT|AskUserQuestion|TodoWrite|TaskCreate|TaskUpdate|subagent_type:|run_in_background|figma:figma-|mcp__plugin_figma_|Skill tool|Task tool')
    for path in operational:
        content = path.read_text()
        check(not forbidden.search(content), 'Operational legacy reference: ' + str(path.relative_to(root)))
        # Optional DS aliases are explicitly skipped by implement when absent.
        optional_refs = {'docs/codex/rules/design-system.md'}
        for target in re.findall(r'`([^`\n]+)`', content):
            if not target.startswith(('.codex/skills/', '.codex/agents/', 'docs/codex/rules/')):
                continue
            if any(c in target for c in '{}<>* $'):
                continue
            target = target.split('#')[0].split(':')[0]
            if target not in optional_refs:
                check((root / target).exists(), f'Broken resource reference: {path.relative_to(root)} -> {target}')
        for condition, message in relative_resource_checks(root, path, content):
            check(condition, message)
        prose = markdown_prose(content)
        prose = re.sub(r'`[^`\n]*`', '', prose)
        for target in re.findall(r'\[[^\]\n]+\]\(([^)\s]+)\)', prose):
            if re.match(r'\w+://|mailto:|#', target) or any(x in target for x in ['{', '<', '*', '$']):
                continue
            target = target.split('#')[0]
            if not target:
                continue
            # Both repository-relative and skill-relative references are used in existing resources.
            candidates = [path.parent / target, root / target, root / '.codex/skills' / target]
            check(any(p.exists() for p in candidates), f'Broken local link: {path.relative_to(root)} -> {target}')
    for name in ['plan-rule-author', 'plan-build', 'plan-validate', 'plan-resolve']:
        content = (root / '.codex/skills' / name / 'SKILL.md').read_text()
        check('docs/codex/planning-rules/' in content and 'docs/rules/' not in content, 'Planning generator/consumer mismatch: ' + name)
    generator = (root / '.codex/skills/generate-test-guide/SKILL.md').read_text()
    check('.codex/skills/testing-guide-<project>/' in generator and '.agents/skills/testing-guide-<project>' in generator, 'Test guide output/discovery mismatch')
    for key, value in baseline['codex_preexisting'].items():
        if value['type'] == 'file':
            backup = root / 'docs/codex/rollback' / Path(key).parent.name / Path(key).name
            check(backup.is_file() and digest(backup) == value['sha256'], 'Missing original rollback copy: ' + key)
    return checks, errors


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--root', type=Path, default=Path(__file__).resolve().parents[1])
    args = parser.parse_args()
    try:
        checks, errors = validate(args.root.resolve())
    except (OSError, ValueError, KeyError) as error:
        print('FAIL:', error)
        return 1
    for error in errors:
        print('FAIL:', error)
    print(f'{checks} static checks; {len(errors)} failures. Dynamic behavior and MCP connectivity are separate checks.')
    return bool(errors)


if __name__ == '__main__':
    sys.exit(main())
