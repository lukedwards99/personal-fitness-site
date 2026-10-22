const $ = id => document.getElementById(id);
const fields = {
  title: $('post-title'), slug: $('post-slug'), kind: $('post-kind'), date: $('post-date'),
  category: $('post-category'), excerpt: $('post-excerpt'), markdown: $('post-markdown'),
};
const state = {
  csrf: '', library: [], workspace: '', maxUploadBytes: 100 * 1024 * 1024,
  post: null, revision: null, isNew: true, dirty: false, slugEdited: false,
  media: [], pending: '', conflict: false, job: null, pollTimer: 0,
  previewRequest: 0, previewBusy: false, authenticated: false,
};
const activeJob = () => state.job && ['queued', 'running'].includes(state.job.status);
const laneName = lane => lane === 'main' ? 'production' : 'development';
const today = () => {
  const date = new Date();
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
};
const slugify = title => title.normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 128).replace(/-$/, '');
const formatDate = value => {
  const date = new Date(`${value}T12:00:00Z`);
  return Number.isNaN(date.valueOf()) ? value : new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' }).format(date);
};
const node = (tag, text, className) => {
  const element = document.createElement(tag);
  if (text !== undefined) element.textContent = text;
  if (className) element.className = className;
  return element;
};

class ApiError extends Error {
  constructor(message, status = 0, fieldErrors) { super(message); this.status = status; this.fields = fieldErrors; }
}

async function api(path, { method = 'GET', body, raw = false } = {}) {
  const headers = { Accept: 'application/json' };
  if (method !== 'GET') headers['X-CSRF-Token'] = state.csrf;
  if (body !== undefined) headers['Content-Type'] = raw ? body.type || 'application/octet-stream' : 'application/json';
  let response;
  try {
    response = await fetch(path, {
      method, headers, credentials: 'same-origin', cache: 'no-store',
      body: body === undefined ? undefined : raw ? body : JSON.stringify(body),
    });
  } catch {
    throw new ApiError('The studio could not be reached. Keep this tab open, check the terminal, and try again.');
  }
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    if (response.status === 401) {
      $('connection-status').textContent = 'Local session expired';
      announce('The studio session has ended. Open the current launch link from your terminal. Download your draft first if you have unsaved writing.', 'error');
    }
    throw new ApiError(typeof data.error === 'string' ? data.error : 'This request could not be completed. Please try again.', response.status, data.fields);
  }
  return data;
}

function announce(message = '', kind = '') {
  $('global-status').textContent = message;
  $('global-status').dataset.state = kind;
}

function editorError(message) {
  $('editor-error').textContent = message;
  $('editor-alert').hidden = !message;
}

function clearFieldError(control) {
  control.setCustomValidity('');
  control.removeAttribute('aria-invalid');
  const id = `${control.id}-error`;
  const described = (control.getAttribute('aria-describedby') || '').split(/\s+/).filter(value => value && value !== id);
  if (described.length) control.setAttribute('aria-describedby', described.join(' '));
  else control.removeAttribute('aria-describedby');
  if ($(id)) { $(id).textContent = ''; $(id).hidden = true; }
}

function showFieldErrors(errors) {
  if (!errors || typeof errors !== 'object' || Array.isArray(errors)) return null;
  let first = null;
  for (const [name, message] of Object.entries(errors)) {
    const control = fields[name] || (name === 'media' ? $('media-files') : null);
    if (!control || typeof message !== 'string') continue;
    const id = `${control.id}-error`;
    let description = $(id);
    if (!description) {
      description = node('p', '', 'field-hint');
      description.id = id;
      description.dataset.state = 'error';
      control.insertAdjacentElement('afterend', description);
    }
    description.textContent = message;
    description.hidden = false;
    const described = new Set((control.getAttribute('aria-describedby') || '').split(/\s+/).filter(Boolean));
    described.add(id);
    control.setAttribute('aria-describedby', [...described].join(' '));
    control.setAttribute('aria-invalid', 'true');
    control.setCustomValidity(message);
    first ??= control;
  }
  return first;
}

function updateControls() {
  const locked = Boolean(state.pending || activeJob() || !state.post);
  $('editor-fields').disabled = locked;
  $('save-button').disabled = !state.authenticated || locked || !state.dirty || state.conflict;
  $('save-button').textContent = state.pending === 'save' ? 'Saving…' : 'Save locally';
  $('reload-button').hidden = state.isNew || !state.post;
  $('reload-button').disabled = locked;
  $('new-journal').disabled = Boolean(state.pending || activeJob() || !state.authenticated);
  $('new-article').disabled = $('new-journal').disabled;
  $('publish-button').disabled = !state.authenticated || !state.library.length || Boolean(state.pending || activeJob() || state.dirty);
  $('backup-button').disabled = !state.authenticated || Boolean(state.pending || activeJob());
  $('publish-lane').disabled = Boolean(state.pending || activeJob());
  $('preview-tab').disabled = !state.post || Boolean(state.pending);
  $('refresh-preview').disabled = !state.post || state.previewBusy || Boolean(state.pending);
  $('download-draft').disabled = !state.post;
  document.querySelectorAll('.library-entry').forEach(button => { button.disabled = Boolean(state.pending || activeJob()); });
  const lane = $('publish-lane').value;
  $('publish-hint').textContent = activeJob() ? 'A library operation is in progress. Editing will resume when it finishes.'
    : state.dirty ? 'Save your changes before publishing the library.'
    : !state.library.length ? 'Create and save your first entry before publishing the library.'
    : lane === 'main' ? 'Production is selected. Publish updates all saved writing on the live site.'
    : 'Publish sends all saved writing to development.';
  $('save-state').dataset.dirty = String(state.dirty);
  $('save-state').textContent = state.pending === 'save' ? 'Saving a local revision…'
    : state.pending === 'open' ? 'Opening the saved entry…'
    : state.pending === 'upload' ? 'Adding media…'
    : state.pending === 'import' ? 'Importing Markdown…'
    : state.conflict ? 'Saved version changed · Your draft is preserved here'
    : state.dirty ? 'Unsaved changes'
    : !state.post ? 'Choose an entry or start a new one.'
    : state.isNew ? 'New entry · Not saved yet' : 'Saved locally';
}

function setPending(value) {
  state.pending = value;
  updateControls();
}

function markDirty() {
  if (!state.post) return;
  state.dirty = true;
  if (!state.conflict) editorError('');
  $('editor-heading').textContent = fields.title.value.trim() || (fields.kind.value === 'journey' ? 'New journal entry' : 'New article');
  updateControls();
}

function canLeave() {
  if (state.pending || activeJob()) {
    announce('Wait for the current operation to finish before changing entries.', 'error');
    return false;
  }
  return !state.dirty || window.confirm('You have unsaved changes. Discard them and open another entry?');
}

function draft() {
  const post = {
    slug: fields.slug.value.trim(), title: fields.title.value.trim(), kind: fields.kind.value,
    date: fields.date.value, category: fields.category.value.trim(), excerpt: fields.excerpt.value.trim(),
    markdown: fields.markdown.value, media: state.media.map(item => ({ type: item.type, path: item.path, alt: item.alt })),
  };
  if (state.post?.sequence !== undefined) post.sequence = state.post.sequence;
  if (state.post?.sample !== undefined) post.sample = state.post.sample;
  return post;
}

function focusEditor() {
  if (window.matchMedia('(max-width: 760px)').matches) $('editor-region').scrollIntoView({ block: 'start' });
}

function applyPost(post, revision, isNew) {
  state.previewRequest++;
  state.previewBusy = false;
  state.post = post;
  state.revision = revision;
  state.isNew = isNew;
  state.dirty = false;
  state.conflict = false;
  state.slugEdited = !isNew;
  state.media = (post.media || []).map(item => ({ type: item.type, path: item.path, alt: item.alt }));
  for (const [key, control] of Object.entries(fields)) control.value = post[key] ?? '';
  fields.slug.readOnly = !isNew;
  $('slug-hint').textContent = isNew ? 'Created from the title. Use lowercase letters, numbers and hyphens.' : 'The slug stays fixed so existing links keep working.';
  $('editor-heading').textContent = post.title || (post.kind === 'journey' ? 'New journal entry' : 'New article');
  $('read-time').textContent = post.readTime ? `${post.readTime} min read · Recalculated when you save` : 'Reading time is calculated when you save.';
  $('upload-status').textContent = '';
  $('upload-status').dataset.state = '';
  for (const control of [...Object.values(fields), $('media-files')]) clearFieldError(control);
  editorError('');
  renderMedia();
  renderLibrary();
  selectTab('write', false);
  updateControls();
}

async function openPost(slug, { force = false } = {}) {
  if (!force && !canLeave()) return;
  setPending('open');
  try {
    const data = await api(`/api/posts/${encodeURIComponent(slug)}`);
    applyPost(data.post, data.revision, false);
    announce('');
    focusEditor();
  } catch (error) {
    editorError(error.message);
    announce('The entry could not be opened. Your current draft is still here.', 'error');
  } finally { setPending(''); }
}

function newEntry(kind, { force = false } = {}) {
  if (!force && !canLeave()) return;
  applyPost({ slug: '', title: '', kind, date: today(), category: kind === 'journey' ? 'Journal' : 'Training', excerpt: '', markdown: '', media: [] }, null, true);
  announce('');
  focusEditor();
  fields.title.focus({ preventScroll: true });
}

function renderLibrary() {
  const terms = $('library-query').value.trim().toLocaleLowerCase('en-US').split(/\s+/).filter(Boolean);
  const kind = $('library-kind').value;
  const posts = state.library.filter(post => (kind === 'all' || post.kind === kind) && terms.every(term => `${post.title} ${post.excerpt} ${post.category}`.toLocaleLowerCase('en-US').includes(term)));
  $('library-count').textContent = posts.length === state.library.length ? `${posts.length} ${posts.length === 1 ? 'post' : 'posts'}` : `${posts.length} of ${state.library.length}`;
  $('library-list').replaceChildren();
  for (const post of posts) {
    const item = node('li');
    const button = node('button', undefined, 'library-entry');
    button.type = 'button';
    if (!state.isNew && post.slug === state.post?.slug) button.setAttribute('aria-current', 'true');
    button.append(node('strong', post.title), node('span', `${formatDate(post.date)} · ${post.kind === 'journey' ? 'Journal' : 'Training'}`));
    button.addEventListener('click', () => {
      if (!state.isNew && post.slug === state.post?.slug) { focusEditor(); return; }
      void openPost(post.slug);
    });
    button.disabled = Boolean(state.pending || activeJob());
    item.append(button);
    $('library-list').append(item);
  }
  $('library-empty').hidden = posts.length > 0;
  $('library-empty').textContent = state.library.length ? 'No writing matches this search. Try another word or section.' : 'Your library is empty. Start a journal entry or training article above.';
}

async function loadLibrary() {
  const data = await api('/api/library');
  state.library = data.posts;
  state.workspace = data.workspace;
  state.maxUploadBytes = Number.isSafeInteger(data.maxUploadBytes) ? data.maxUploadBytes : state.maxUploadBytes;
  $('workspace-path').textContent = data.workspace;
  $('credentials-source').textContent = typeof data.credentialsSource === 'string' ? data.credentialsSource : 'Configured on this Mac';
  $('connection-status').textContent = data.credentialsSource === 'Keychain' ? 'Local session · Keychain credentials loaded'
    : data.credentialsSource === 'environment' ? 'Local session · Environment credentials loaded'
    : 'Local session · Credential source unavailable';
  $('dev-bucket').textContent = data.buckets?.dev ?? 'Not configured';
  $('main-bucket').textContent = data.buckets?.main ?? 'Not configured';
  $('upload-hint').textContent = `Up to ${Math.floor(state.maxUploadBytes / 1024 / 1024)} MiB per file. Files are added in selection order. Add alt text before saving.`;
  renderLibrary();
  return data;
}

function mediaElement(media, { editor = false } = {}) {
  const element = document.createElement(media.type === 'image' ? 'img' : 'video');
  element.src = media.path;
  if (media.type === 'image') {
    element.alt = media.alt;
    element.loading = 'lazy';
    element.decoding = 'async';
  } else {
    element.controls = true;
    element.preload = 'metadata';
    element.playsInline = true;
    element.setAttribute('aria-label', media.alt || (editor ? 'Video awaiting a description' : 'Video'));
  }
  return element;
}

function renderMedia(focusIndex) {
  clearFieldError($('media-files'));
  $('media-list').replaceChildren();
  $('media-count').textContent = `${state.media.length} ${state.media.length === 1 ? 'file' : 'files'}`;
  $('media-empty').hidden = state.media.length > 0;
  state.media.forEach((media, index) => {
    const item = node('li', undefined, 'media-item');
    const figure = node('figure');
    figure.append(mediaElement(media, { editor: true }), node('figcaption', `${media.type === 'image' ? 'Photo' : 'Video'} ${index + 1}`));
    const content = node('div');
    const label = node('label', 'Alt text (required)');
    label.htmlFor = `media-alt-${index}`;
    const alt = node('textarea');
    alt.id = `media-alt-${index}`;
    alt.rows = 2;
    alt.maxLength = 1000;
    alt.required = true;
    alt.value = media.alt;
    alt.setAttribute('aria-label', `${media.type === 'image' ? 'Photo' : 'Video'} ${index + 1} alt text`);
    alt.addEventListener('input', () => {
      media.alt = alt.value;
      clearFieldError(alt);
      clearFieldError($('media-files'));
      const image = figure.querySelector('img');
      if (image) image.alt = media.alt;
      const video = figure.querySelector('video');
      if (video) video.setAttribute('aria-label', media.alt || 'Video awaiting a description');
      markDirty();
    });
    const controls = node('div', undefined, 'media-controls');
    const move = (labelText, direction) => {
      const button = node('button', labelText, 'button button-secondary');
      button.type = 'button';
      button.disabled = index + direction < 0 || index + direction >= state.media.length;
      button.setAttribute('aria-label', `${labelText.toLowerCase()} ${media.type === 'image' ? 'photo' : 'video'} ${index + 1}`);
      button.addEventListener('click', () => {
        const destination = index + direction;
        [state.media[index], state.media[destination]] = [state.media[destination], state.media[index]];
        markDirty();
        renderMedia(destination);
      });
      return button;
    };
    const remove = node('button', 'Remove', 'button button-secondary remove-media');
    remove.type = 'button';
    remove.setAttribute('aria-label', `Remove ${media.type === 'image' ? 'photo' : 'video'} ${index + 1}`);
    remove.addEventListener('click', () => {
      state.media.splice(index, 1);
      markDirty();
      renderMedia(Math.min(index, state.media.length - 1));
      if (!state.media.length) $('media-files').focus();
    });
    controls.append(move('Move up', -1), move('Move down', 1), remove);
    content.append(label, alt, controls);
    item.append(figure, content);
    $('media-list').append(item);
  });
  if (focusIndex !== undefined && focusIndex >= 0) $(`media-alt-${focusIndex}`)?.focus({ preventScroll: true });
}

async function savePost(event) {
  event.preventDefault();
  if (state.pending || activeJob() || state.conflict || !state.post) return;
  if (!$('post-form').checkValidity()) {
    selectTab('write', false);
    $('post-form').reportValidity();
    return;
  }
  if (!fields.markdown.value.trim()) {
    selectTab('write', false);
    fields.markdown.setCustomValidity('Write the body before saving.');
    fields.markdown.reportValidity();
    return;
  }
  const blankAlt = state.media.findIndex(item => !item.alt.trim());
  if (blankAlt >= 0) {
    selectTab('write', false);
    const control = $(`media-alt-${blankAlt}`);
    control.setCustomValidity('Describe this photo or video before saving.');
    control.reportValidity();
    return;
  }
  const post = draft();
  const expectedRevision = state.isNew ? null : state.revision;
  let invalidControl = null;
  setPending('save');
  try {
    const data = await api('/api/posts', { method: 'POST', body: { post, expectedRevision } });
    applyPost(data.post, data.revision, false);
    announce('Saved locally. Publish the library when you’re ready.', 'success');
    try { await loadLibrary(); } catch { announce('Saved locally. The library list could not refresh; reload when you’re ready.', 'error'); }
  } catch (error) {
    invalidControl = showFieldErrors(error.fields);
    if (error.status === 423) {
      editorError('A library operation is in progress. Your draft is still here and can be saved when it finishes.');
      await recoverActiveJob();
    } else if (error.status === 409 && !state.isNew) {
      state.conflict = true;
      editorError('This entry changed outside the studio. Your draft is still here. Download it to keep a copy, then use Reload saved to open the latest revision.');
    } else if (error.status === 409) {
      editorError('That slug already exists. Choose a different web address slug before saving this new entry.');
    } else editorError(`${error.message} Your draft is still here.`);
  } finally {
    setPending('');
    if (invalidControl) { selectTab('write', false); invalidControl.focus(); }
  }
}

async function uploadFiles(event) {
  const files = [...event.target.files];
  event.target.value = '';
  if (!files.length || state.pending || activeJob()) return;
  const errors = [];
  let added = 0;
  setPending('upload');
  $('upload-status').dataset.state = '';
  for (let index = 0; index < files.length; index++) {
    const file = files[index];
    if (file.size > state.maxUploadBytes) { errors.push(`${file.name}: exceeds the per-file limit.`); continue; }
    if (!file.size) { errors.push(`${file.name}: the file is empty.`); continue; }
    $('upload-status').textContent = `Adding file ${index + 1} of ${files.length}: ${file.name}`;
    try {
      const data = await api(`/api/media?filename=${encodeURIComponent(file.name)}`, { method: 'POST', body: file, raw: true });
      state.media.push({ type: data.media.type, path: data.media.path, alt: '' });
      added++;
      markDirty();
      renderMedia();
    } catch (error) {
      errors.push(`${file.name}: ${error.message}`);
      if (error.status === 423) { await recoverActiveJob(); break; }
      if (error.status === 401 || error.status === 403) break;
    }
  }
  setPending('');
  $('upload-status').textContent = `${added} ${added === 1 ? 'file added' : 'files added'}.${added ? ' Add alt text, then save to keep your changes.' : ''}${errors.length ? ` ${errors.join(' ')}` : ''}`;
  $('upload-status').dataset.state = errors.length ? 'error' : 'success';
  if (added) $(`media-alt-${state.media.length - added}`)?.focus();
}

async function importMarkdown(event) {
  const file = event.target.files[0];
  event.target.value = '';
  if (!file || state.pending || activeJob()) return;
  if (file.size > 2 * 1024 * 1024) { editorError('Choose a Markdown or text file no larger than 2 MiB.'); return; }
  if (!/\.(md|txt)$/i.test(file.name)) { editorError('Choose a .md or .txt file.'); return; }
  if (fields.markdown.value && !window.confirm(`Replace the current body with “${file.name}”? The other fields and media stay in place.`)) return;
  setPending('import');
  try {
    const text = await file.text();
    if (!text.trim()) { editorError('The selected file is empty. The current body has been kept.'); return; }
    fields.markdown.value = text;
    clearFieldError(fields.markdown);
    markDirty();
    announce('Markdown imported into this draft. Save locally to keep it.');
  } catch { editorError('The file could not be read. The current body has been kept.'); }
  finally { setPending(''); }
}

function selectTab(tab, refresh = true) {
  const preview = tab === 'preview';
  for (const name of ['write', 'preview']) {
    const selected = name === tab;
    $(`${name}-tab`).setAttribute('aria-selected', String(selected));
    $(`${name}-tab`).tabIndex = selected ? 0 : -1;
    $(`${name}-panel`).hidden = !selected;
  }
  if (preview && refresh) void renderPreview();
}

async function renderPreview() {
  if (!state.post || state.pending) return;
  const generation = ++state.previewRequest;
  const post = draft();
  state.previewBusy = true;
  $('preview-status').textContent = 'Building the preview…';
  $('preview-status').dataset.state = '';
  updateControls();
  $('preview-title').textContent = post.title || 'Untitled entry';
  $('preview-meta').textContent = `${post.kind === 'journey' ? 'Journal' : 'Training'} · ${post.category} · ${formatDate(post.date)}`;
  $('preview-excerpt').textContent = post.excerpt;
  $('preview-excerpt').hidden = !post.excerpt;
  $('preview-body').replaceChildren();
  $('preview-media').replaceChildren();
  try {
    const data = await api('/api/preview', { method: 'POST', body: { markdown: post.markdown } });
    if (generation !== state.previewRequest) return;
    if (typeof data.html !== 'string') throw new ApiError('The preview response was incomplete. Try refreshing it.');
    // This is the sole HTML insertion: the local server sanitizes its Markdown output.
    $('preview-body').innerHTML = data.html;
    for (const media of post.media) {
      const figure = node('figure');
      figure.append(mediaElement(media));
      if (media.alt) figure.append(node('figcaption', media.alt));
      $('preview-media').append(figure);
    }
    $('preview-status').textContent = post.media.some(item => !item.alt.trim()) ? 'Preview ready. Add alt text to every photo and video before saving.' : '';
  } catch (error) {
    if (generation === state.previewRequest) {
      $('preview-status').textContent = `${error.message} Use Refresh preview to try again.`;
      $('preview-status').dataset.state = 'error';
    }
  } finally {
    if (generation === state.previewRequest) { state.previewBusy = false; updateControls(); }
  }
}

function describeProgress(progress) {
  if (typeof progress === 'string') return progress;
  if (progress && typeof progress.message === 'string') return progress.message;
  if (progress && Number.isFinite(progress.completed) && Number.isFinite(progress.total)) return `${progress.completed} of ${progress.total} objects processed.`;
  return 'Keep this studio open while the operation finishes.';
}

function renderJob() {
  const job = state.job;
  $('job-panel').hidden = !job;
  if (!job) return;
  const publishing = job.action === 'publish';
  const lane = laneName(job.lane);
  $('job-heading').textContent = publishing ? `Publish library · ${lane}` : `Back up ${lane}`;
  $('job-message').dataset.state = job.status === 'succeeded' ? 'success' : job.status === 'failed' ? 'error' : '';
  $('job-message').textContent = job.status === 'succeeded' ? (publishing ? `The saved library was published to ${lane}.` : `The ${lane} backup was saved locally.`)
    : job.status === 'failed' ? (typeof job.error === 'string' ? job.error : 'The operation could not be completed. Check the terminal and try again.')
    : job.status === 'queued' ? 'Queued. The saved library will be processed shortly.' : describeProgress(job.progress);
  $('job-result').replaceChildren();
  if (job.result && typeof job.result === 'object') {
    const labels = { postCount: 'Posts', objectCount: 'Objects', uploadedMedia: 'Uploaded media', existingMedia: 'Existing media', mediaCount: 'Media files', snapshot: 'Backup folder', receiptPath: 'Receipt', sha256: 'Release', catalogKey: 'Catalog' };
    for (const [key, value] of Object.entries(job.result)) {
      if (!Object.hasOwn(labels, key) || !['string', 'number'].includes(typeof value)) continue;
      $('job-result').append(node('dt', labels[key]), node('dd', String(value)));
    }
  }
  updateControls();
}

async function pollJob() {
  window.clearTimeout(state.pollTimer);
  const id = state.job?.id;
  if (!id || !activeJob()) return;
  $('check-job-button').hidden = true;
  try {
    const data = await api(`/api/jobs/${encodeURIComponent(id)}`);
    if (state.job?.id !== id) return;
    state.job = data.job;
    renderJob();
    if (activeJob()) state.pollTimer = window.setTimeout(() => void pollJob(), 900);
    else {
      if (state.job.status === 'succeeded') announce(state.job.action === 'publish' ? `Published to ${laneName(state.job.lane)}.` : 'Backup complete.', 'success');
      try { await loadLibrary(); } catch { announce('The operation finished, but the library list could not refresh. Reload when you’re ready.', 'error'); }
      updateControls();
    }
  } catch (error) {
    if (state.job?.id !== id) return;
    $('job-message').textContent = `${error.message} The operation may still be running. Check its progress before starting another.`;
    $('job-message').dataset.state = 'error';
    $('check-job-button').hidden = false;
  }
}

async function startJob(action) {
  if (state.pending || activeJob() || (action === 'publish' && state.dirty)) return;
  setPending(action);
  try {
    const data = await api('/api/jobs', { method: 'POST', body: { action, lane: $('publish-lane').value } });
    state.job = data.job;
    renderJob();
    if (activeJob()) void pollJob();
  } catch (error) {
    announce(error.message, 'error');
    if (error.status === 409 || error.status === 423) await recoverActiveJob();
  }
  finally { setPending(''); }
}

async function recoverActiveJob() {
  try {
    const data = await loadLibrary();
    if (data.activeJob && ['queued', 'running'].includes(data.activeJob.status)) {
      state.job = data.activeJob;
      renderJob();
      void pollJob();
    }
  } catch { /* Keep the original operation error and unsaved draft in place. */ }
}

function downloadDraft() {
  if (!state.post) return;
  const post = draft();
  const url = URL.createObjectURL(new Blob([`${JSON.stringify(post, null, 2)}\n`], { type: 'application/json' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = `${post.slug || 'unsaved-entry'}.draft.json`;
  document.body.append(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

for (const [key, control] of Object.entries(fields)) {
  control.addEventListener('input', () => {
    clearFieldError(control);
    if (key === 'slug' && state.isNew) state.slugEdited = true;
    if (key === 'title' && state.isNew && !state.slugEdited) {
      fields.slug.value = slugify(control.value);
      clearFieldError(fields.slug);
    }
    markDirty();
  });
}
$('library-search-form').addEventListener('submit', event => event.preventDefault());
$('library-query').addEventListener('input', renderLibrary);
$('library-kind').addEventListener('change', renderLibrary);
$('publish-lane').addEventListener('change', updateControls);
$('new-journal').addEventListener('click', () => newEntry('journey'));
$('new-article').addEventListener('click', () => newEntry('advice'));
$('reload-button').addEventListener('click', () => { if (state.post) void openPost(state.post.slug); });
$('post-form').addEventListener('submit', event => void savePost(event));
$('media-files').addEventListener('change', event => void uploadFiles(event));
$('markdown-file').addEventListener('change', event => void importMarkdown(event));
$('write-tab').addEventListener('click', () => selectTab('write'));
$('preview-tab').addEventListener('click', () => selectTab('preview'));
$('refresh-preview').addEventListener('click', () => void renderPreview());
$('publish-button').addEventListener('click', () => void startJob('publish'));
$('backup-button').addEventListener('click', () => void startJob('backup'));
$('check-job-button').addEventListener('click', () => void pollJob());
$('download-draft').addEventListener('click', downloadDraft);
for (const tab of [$('write-tab'), $('preview-tab')]) {
  tab.addEventListener('keydown', event => {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
    event.preventDefault();
    const selected = event.key === 'Home' ? 'write' : event.key === 'End' ? 'preview' : tab.id === 'write-tab' ? 'preview' : 'write';
    if ($(`${selected}-tab`).disabled) return;
    selectTab(selected);
    $(`${selected}-tab`).focus();
  });
}
window.addEventListener('beforeunload', event => {
  if (!state.dirty && !state.pending) return;
  event.preventDefault();
  event.returnValue = '';
});

async function boot(launchToken) {
  try {
    const response = await fetch('/api/session', {
      method: launchToken ? 'POST' : 'GET', credentials: 'same-origin', cache: 'no-store',
      headers: launchToken ? { Authorization: `Bearer ${launchToken}`, 'Content-Type': 'application/json', Accept: 'application/json' } : { Accept: 'application/json' },
      body: launchToken ? '{}' : undefined,
    });
    launchToken = null;
    const session = await response.json().catch(() => ({}));
    if (!response.ok || typeof session.csrfToken !== 'string') throw new ApiError('Open the current launch link from the terminal to start a studio session. Keep the terminal running while you write.');
    state.csrf = session.csrfToken;
    state.authenticated = true;
    const data = await loadLibrary();
    $('session-screen').hidden = true;
    $('app').hidden = false;
    window.clearTimeout(state.pollTimer);
    state.job = data.activeJob && ['queued', 'running'].includes(data.activeJob.status) ? data.activeJob : null;
    // A fresh launch link can renew a session in this tab without discarding its draft.
    if (!state.post) {
      if (state.library.length) await openPost(state.library[0].slug, { force: true });
      else newEntry('journey', { force: true });
    }
    renderJob();
    if (state.job) void pollJob();
    updateControls();
  } catch (error) {
    launchToken = null;
    state.authenticated = false;
    $('connection-status').textContent = 'Local session unavailable';
    if (state.post) {
      announce(`${error.message} Your draft is still here. Download it before reopening the studio.`, 'error');
      editorError('The studio session could not be opened. Your current draft has been kept.');
      updateControls();
      return;
    }
    $('session-screen').hidden = false;
    $('app').hidden = true;
    $('session-message').textContent = `${error.message} No Cloudflare token needs to be entered in this page.`;
    $('session-message').dataset.state = 'error';
  }
}

let bootstrapQueue = Promise.resolve();
function scheduleBoot() {
  let launchToken = new URLSearchParams(window.location.hash.slice(1)).get('session');
  if (window.location.hash) history.replaceState(null, '', `${window.location.pathname}${window.location.search}`);
  bootstrapQueue = bootstrapQueue.then(() => boot(launchToken)).finally(() => { launchToken = null; });
}
window.addEventListener('hashchange', () => {
  if (new URLSearchParams(window.location.hash.slice(1)).has('session')) scheduleBoot();
});
scheduleBoot();
