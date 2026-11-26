#!/usr/bin/env python3
"""Проверка данных тренажёра перед публикацией.

Запуск из корня приложения:  python3 tools/validate.py [--fix]
--fix  ставит неразрывные пробелы в числах вида «12 000» в полях q, a, story.
Код выхода 0 — всё в порядке, 1 — есть ошибки (приложение может их пропустить или упасть).
"""
import json, os, re, sys
from collections import Counter

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..')
DATA = os.path.join(ROOT, 'data')
TYPES = {'input', 'order', 'find', 'pick'}
errors, warns = [], []


def load(rel):
    path = os.path.join(DATA, rel)
    if not os.path.exists(path):
        errors.append(f'нет файла data/{rel}')
        return None
    try:
        with open(path, encoding='utf-8') as f:
            return json.load(f)
    except Exception as e:
        errors.append(f'data/{rel}: не читается JSON — {e}')
        return None


def nbsp(s):
    return re.sub(r'(?<=\d) (?=\d{3}\b)', ' ', s)


def check_q(q, where, topics):
    qid = q.get('id', '?')
    p = f'{where} [{qid}]'
    for k in ('id', 'topic', 'type', 't', 'q'):
        if not q.get(k):
            errors.append(f'{p}: нет поля {k}')
    if q.get('topic') not in topics:
        errors.append(f'{p}: тема «{q.get("topic")}» не описана в topics.json')
    t = q.get('type')
    if t not in TYPES:
        errors.append(f'{p}: неизвестный тип {t}')
        return
    if not re.fullmatch(r'[a-z0-9][a-z0-9\-]*', str(qid)):
        errors.append(f'{p}: id — только латиница в нижнем регистре, цифры и дефис')
    if t == 'input':
        if q.get('check') not in ('self', 'auto'):
            errors.append(f'{p}: check должен быть self или auto')
        if not q.get('a'):
            errors.append(f'{p}: нет эталона a')
        if q.get('check') == 'auto' and not q.get('accept'):
            errors.append(f'{p}: у auto нет списка accept')
        if q.get('blocks') is not None and len(q['blocks']) < 2:
            errors.append(f'{p}: blocks — минимум 2 блока')
    if t == 'order':
        if len(q.get('items') or []) < 3:
            errors.append(f'{p}: order — минимум 3 элемента')
        if len(set(q.get('items') or [])) != len(q.get('items') or []):
            errors.append(f'{p}: order — элементы повторяются')
    if t == 'pick':
        opts = q.get('options') or []
        if len(opts) < 2:
            errors.append(f'{p}: pick — минимум 2 варианта')
        if not isinstance(q.get('wrong'), int) or not 0 <= q['wrong'] < len(opts):
            errors.append(f'{p}: pick — wrong вне диапазона')
        if not q.get('a'):
            errors.append(f'{p}: нет разбора a')
    if t == 'find':
        code = q.get('code') or []
        for e in q.get('err') or []:
            if not (0 <= e[0] < len(code) and 0 <= e[1] < len(code[e[0]])):
                errors.append(f'{p}: find — err {e} вне кода')
        if not q.get('err'):
            errors.append(f'{p}: find — нет err')
        if not q.get('a'):
            errors.append(f'{p}: нет разбора a')
    if q.get('story') and not q.get('case'):
        warns.append(f'{p}: есть story, но нет case (заголовка кейса)')
    if q.get('src') and not str(q['src'].get('url', '')).startswith('https://'):
        errors.append(f'{p}: src.url должен начинаться с https://')
    if q.get('table'):
        tb = q['table']
        for r in tb.get('rows', []) + ([tb['labels']] if tb.get('labels') else []):
            if len(r) != len(tb.get('cols', [])):
                errors.append(f'{p}: в таблице строка не совпадает по числу столбцов')
    if len(q.get('q', '')) > 260:
        warns.append(f'{p}: длинная формулировка вопроса — проверь правило «один вопрос — одно действие»')


def main():
    fix = '--fix' in sys.argv
    m = load('manifest.json')
    if not m:
        print('\n'.join(errors)); sys.exit(1)
    tp = load(m.get('topics', 'topics.json')) or {}
    topics = {t['id'] for t in tp.get('topics', [])}
    extra = {t['id'] for t in tp.get('topics', []) if t.get('extra')}
    cc = (load(m['concepts']) or {}).get('concepts', {}) if m.get('concepts') else {}
    for cid, c in cc.items():
        for l in c.get('links', []):
            if not str(l.get('url', '')).startswith('https://'):
                errors.append(f'concepts.json [{cid}]: ссылка без https')
    for k in ('config', 'weeks', 'changelog'):
        if m.get(k):
            load(m[k])
    weeks = load(m['weeks']) if m.get('weeks') else None
    if weeks:
        ids = [w.get('id') for w in weeks.get('weeks', [])]
        if len(ids) != len(set(ids)):
            errors.append('weeks.json: повторяются id недель')
        for w in weeks.get('weeks', []):
            if not (w.get('start') and w.get('end') and w['start'] <= w['end']):
                errors.append(f'weeks.json [{w.get("id")}]: проверь start/end')
            for l in w.get('links', []):
                if not str(l.get('url', '')).startswith('https://'):
                    errors.append(f'weeks.json [{w.get("id")}]: ссылка без https — {l.get("title")}')
    all_ids, by_topic, by_type = Counter(), Counter(), Counter()
    extra_ids = set()
    for rel in m.get('packs', []):
        pk = load(rel)
        if not pk:
            continue
        if not pk.get('pack'):
            errors.append(f'{rel}: нет поля pack')
        changed = False
        for q in pk.get('questions', []):
            check_q(q, rel, topics)
            all_ids[q.get('id')] += 1
            if q.get('concept') and q['concept'] not in cc:
                errors.append(f'{rel} [{q.get("id")}]: нет понятия «{q["concept"]}» в concepts.json')
            if q.get('topic') in extra:
                extra_ids.add(q.get('id'))
            by_topic[q.get('topic')] += 1
            by_type[q.get('type')] += 1
            if fix:
                for k in ('q', 'a', 'story'):
                    if isinstance(q.get(k), str) and nbsp(q[k]) != q[k]:
                        q[k] = nbsp(q[k]); changed = True
        if fix and changed:
            with open(os.path.join(DATA, rel), 'w', encoding='utf-8') as f:
                json.dump(pk, f, ensure_ascii=False, indent=1)
    if weeks:
        for w in weeks.get('weeks', []):
            for b in w.get('focus', []):
                miss = [i for i in b.get('ids', []) if i not in all_ids]
                if miss:
                    errors.append(f'weeks.json [{w.get("id")}] блок «{b.get("name")}»: нет вопросов {miss[:5]}')
        placed = {i for w in weeks.get('weeks', []) for b in w.get('focus', []) for i in b.get('ids', [])}
        free = [i for i in all_ids if i not in placed and i not in extra_ids]
        if free:
            warns.append(f'{len(free)} вопросов не распределены по неделям: {free[:8]}')
    for i, n in all_ids.items():
        if n > 1:
            errors.append(f'id «{i}» встречается {n} раза — в приложении останется только первый')
    print(f'Версия {m.get("version")}: {sum(all_ids.values())} вопросов')
    print('  по темам:', dict(by_topic))
    print('  по типам:', dict(by_type))
    for w in warns:
        print('ПРЕДУПРЕЖДЕНИЕ', w)
    for e in errors:
        print('ОШИБКА', e)
    print('OK' if not errors else f'{len(errors)} ошибок')
    sys.exit(1 if errors else 0)


if __name__ == '__main__':
    main()
