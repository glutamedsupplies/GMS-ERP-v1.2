(function initializeKpiTimeoutUi(global) {
    'use strict';

    function createKpiTimeoutController({ appClient, root }) {
        if (!appClient || !root) {
            throw new Error('KPI time-out controller requires appClient and a root element.');
        }

        const requiredSection = root.querySelector('[data-kpi-required-section]');
        const requiredMeta = root.querySelector('[data-kpi-required-meta]');
        const requiredList = root.querySelector('[data-kpi-required-list]');
        const issueToggle = root.querySelector('[data-kpi-issue-toggle]');
        const issuePanel = root.querySelector('[data-kpi-issue-panel]');
        const issueEmployees = root.querySelector('[data-kpi-issue-employees]');
        const issueList = root.querySelector('[data-kpi-issue-list]');
        let context = null;
        let evaluatorId = '';
        let collapseTimer = null;

        issueToggle?.addEventListener('click', () => {
            setIssueExpanded(issueToggle.getAttribute('aria-expanded') !== 'true');
        });

        function escapeHtml(value) {
            return appClient.escapeHtml(String(value ?? ''));
        }

        function buildAvatar(employee) {
            return employee.profilePicture
                || appClient.buildAvatarUrl(employee.name || employee.id || 'Employee', 'dbeafe', '1e3a8a');
        }

        function getEmployeeSubtitle(employee) {
            return [employee.branchName, employee.role]
                .map((value) => String(value || '').trim())
                .filter(Boolean)
                .join(' · ') || 'Active employee';
        }

        function getGuide(rating) {
            return (context?.ratingGuide || []).find((item) => Number(item.rating) === Number(rating)) || null;
        }

        function isCommentRequired(card, rating) {
            return false;
        }

        function buildEvaluationCard(employee, evaluationType) {
            const employeeId = escapeHtml(employee.id);
            const typeLabel = evaluationType === 'required_evaluation' ? 'Daily KPI' : 'KPI';
            return `
                <article class="kpi-evaluation-card" data-kpi-card data-employee-id="${employeeId}" data-evaluation-type="${evaluationType}" data-rating="0">
                  <div class="kpi-evaluation-person">
                    <img class="kpi-person-avatar" src="${escapeHtml(buildAvatar(employee))}" alt="">
                    <div class="kpi-person-copy">
                      <strong>${escapeHtml(employee.name)}</strong>
                      <span>${escapeHtml(getEmployeeSubtitle(employee))} · ${typeLabel}</span>
                    </div>
                  </div>
                  <div class="kpi-rating-row">
                    <div class="kpi-stars" role="radiogroup" aria-label="Rating for ${escapeHtml(employee.name)}">
                      ${[1, 2, 3, 4, 5].map((rating) => `
                        <button class="kpi-star" type="button" data-kpi-rating="${rating}" role="radio" aria-checked="false" aria-label="${rating} star${rating === 1 ? '' : 's'}">★</button>
                      `).join('')}
                    </div>
                    <span class="kpi-rating-label" data-kpi-rating-label data-tone="neutral">Select rating</span>
                  </div>
                  <label class="kpi-comment-label">
                    <span>Comment / reason</span>
                    <span class="kpi-comment-requirement" data-kpi-comment-requirement>Optional</span>
                  </label>
                  <textarea class="kpi-evaluation-comment" data-kpi-comment maxlength="2000" placeholder="Add specific, professional feedback..."></textarea>
                  <div class="kpi-card-validation" data-kpi-validation aria-live="polite"></div>
                </article>
            `;
        }

        function bindEvaluationCard(card) {
            card.querySelectorAll('[data-kpi-rating]').forEach((button) => {
                button.addEventListener('click', () => {
                    setCardRating(card, Number(button.dataset.kpiRating));
                });
            });
            card.querySelector('[data-kpi-comment]')?.addEventListener('input', () => clearCardError(card));
        }

        function setCardRating(card, rating) {
            const guide = getGuide(rating);
            card.dataset.rating = String(rating || 0);
            card.querySelectorAll('[data-kpi-rating]').forEach((button) => {
                const active = Number(button.dataset.kpiRating) <= rating;
                const selected = Number(button.dataset.kpiRating) === rating;
                button.classList.toggle('is-active', active);
                button.setAttribute('aria-checked', selected ? 'true' : 'false');
            });
            const label = card.querySelector('[data-kpi-rating-label]');
            if (label) {
                label.textContent = guide?.label || 'Select rating';
                label.dataset.tone = guide?.tone || 'neutral';
            }
            const requirement = card.querySelector('[data-kpi-comment-requirement]');
            if (requirement) {
                const required = isCommentRequired(card, rating);
                requirement.textContent = required ? 'Required' : 'Optional';
                requirement.classList.toggle('is-required', required);
            }
            clearCardError(card);
        }

        function clearCardError(card) {
            card.classList.remove('has-error');
            const validation = card.querySelector('[data-kpi-validation]');
            if (validation) {
                validation.textContent = '';
            }
        }

        function showCardError(card, message, focusSelector) {
            card.classList.add('has-error');
            const validation = card.querySelector('[data-kpi-validation]');
            if (validation) {
                validation.textContent = message;
            }
            const error = new Error(message);
            error.focusElement = card.querySelector(focusSelector) || card;
            throw error;
        }

        function renderRequiredEvaluation() {
            if (!requiredSection || !requiredList) {
                return;
            }
            const requiredState = context?.requiredEvaluation || {};
            requiredSection.hidden = !requiredState.isDue;
            if (!requiredState.isDue) {
                requiredList.innerHTML = '';
                return;
            }
            if (requiredMeta) {
                const period = context.period || {};
                requiredMeta.textContent = `${requiredState.employeeCount} active coworker${requiredState.employeeCount === 1 ? '' : 's'} · ${period.start} to ${period.end}`;
            }
            if (requiredMeta) {
                const period = context.period || {};
                requiredMeta.textContent = `${requiredState.employeeCount} present coworker${requiredState.employeeCount === 1 ? '' : 's'} - ${period.start} to ${period.end}`;
            }
            requiredList.innerHTML = (context.activeEmployees || [])
                .map((employee) => buildEvaluationCard(employee, 'required_evaluation'))
                .join('');
            requiredList.querySelectorAll('[data-kpi-card]').forEach(bindEvaluationCard);
        }

        function renderIssueEmployees() {
            if (!issueEmployees || !issueList) {
                return;
            }
            const employees = context?.activeEmployees || [];
            issueList.innerHTML = '';
            if (!employees.length) {
                issueEmployees.innerHTML = '<div class="kpi-empty-state">No other present employees are available.</div>';
                if (issueToggle) {
                    issueToggle.disabled = true;
                }
                return;
            }
            if (issueToggle) {
                issueToggle.disabled = !context?.issueEncounter?.enabled;
            }
            issueEmployees.innerHTML = employees.map((employee) => `
                <label class="kpi-employee-option">
                  <input type="checkbox" value="${escapeHtml(employee.id)}" data-kpi-employee-check>
                  <span>${escapeHtml(employee.name)} · ${escapeHtml(getEmployeeSubtitle(employee))}</span>
                </label>
            `).join('');
            issueEmployees.querySelectorAll('[data-kpi-employee-check]').forEach((checkbox) => {
                checkbox.addEventListener('change', () => syncIssueCard(checkbox));
            });
        }

        function syncIssueCard(checkbox) {
            const employeeIdValue = String(checkbox.value || '');
            const existing = Array.from(issueList.querySelectorAll('[data-kpi-card]'))
                .find((card) => card.dataset.employeeId === employeeIdValue);
            if (!checkbox.checked) {
                existing?.remove();
                return;
            }
            if (existing) {
                return;
            }
            const employee = (context?.activeEmployees || [])
                .find((item) => String(item.id) === employeeIdValue);
            if (!employee) {
                checkbox.checked = false;
                return;
            }
            issueList.insertAdjacentHTML('beforeend', buildEvaluationCard(employee, 'issue_encounter'));
            const card = issueList.lastElementChild;
            bindEvaluationCard(card);
            card.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
        }

        function setIssueExpanded(expanded) {
            if (!issueToggle || !issuePanel) {
                return;
            }
            if (collapseTimer) {
                global.clearTimeout(collapseTimer);
                collapseTimer = null;
            }
            issueToggle.setAttribute('aria-expanded', expanded ? 'true' : 'false');
            if (expanded) {
                issuePanel.hidden = false;
                global.requestAnimationFrame(() => issuePanel.classList.add('is-expanded'));
                issuePanel.setAttribute('aria-hidden', 'false');
                return;
            }
            issuePanel.classList.remove('is-expanded');
            issuePanel.setAttribute('aria-hidden', 'true');
            collapseTimer = global.setTimeout(() => {
                if (issueToggle.getAttribute('aria-expanded') !== 'true') {
                    issuePanel.hidden = true;
                }
            }, 240);
        }

        function collectCards(container) {
            return Array.from(container?.querySelectorAll('[data-kpi-card]') || []).map((card) => {
                clearCardError(card);
                const employeeIdValue = String(card.dataset.employeeId || '');
                const employee = (context?.activeEmployees || []).find((item) => String(item.id) === employeeIdValue);
                const rating = Number(card.dataset.rating || 0);
                const comment = String(card.querySelector('[data-kpi-comment]')?.value || '').trim();
                if (!rating) {
                    showCardError(card, `Select a star rating for ${employee?.name || 'this employee'}.`, '[data-kpi-rating="1"]');
                }
                const required = isCommentRequired(card, rating);
                if (required && !comment) {
                    showCardError(card, `Add a comment or reason for ${employee?.name || 'this employee'}.`, '[data-kpi-comment]');
                }
                return { ratedEmployeeId: employeeIdValue, rating, comment };
            });
        }

        async function load(nextEvaluatorId) {
            evaluatorId = String(nextEvaluatorId || '').trim();
            if (!evaluatorId) {
                throw new Error('Employee ID is required for KPI evaluation.');
            }
            context = null;
            setIssueExpanded(false);
            if (requiredSection) {
                requiredSection.hidden = false;
            }
            if (requiredList) {
                requiredList.innerHTML = '<div class="kpi-loading-state">Checking the current KPI evaluation schedule...</div>';
            }
            if (issueEmployees) {
                issueEmployees.innerHTML = '<div class="kpi-loading-state">Loading active employees...</div>';
            }
            if (issueList) {
                issueList.innerHTML = '';
            }
            context = await appClient.getKpiEvaluationContext(evaluatorId);
            renderRequiredEvaluation();
            renderIssueEmployees();
            return context;
        }

        function collect() {
            if (!context) {
                throw new Error('KPI evaluation details are still loading.');
            }
            const requiredEvaluations = context.requiredEvaluation?.isDue
                ? collectCards(requiredList)
                : [];
            const issueEncounters = collectCards(issueList);
            return { requiredEvaluations, issueEncounters };
        }

        function reset() {
            context = null;
            evaluatorId = '';
            if (requiredList) requiredList.innerHTML = '';
            if (issueEmployees) issueEmployees.innerHTML = '';
            if (issueList) issueList.innerHTML = '';
            if (requiredSection) requiredSection.hidden = true;
            setIssueExpanded(false);
        }

        function setBusy(disabled) {
            root.querySelectorAll('button, input, textarea').forEach((control) => {
                control.disabled = Boolean(disabled);
            });
            if (!disabled && issueToggle) {
                issueToggle.disabled = !context?.issueEncounter?.enabled || !(context?.activeEmployees || []).length;
            }
        }

        return {
            load,
            collect,
            reset,
            setBusy,
            getContext: () => context,
            isReady: () => Boolean(context)
        };
    }

    global.createKpiTimeoutController = createKpiTimeoutController;
})(window);
