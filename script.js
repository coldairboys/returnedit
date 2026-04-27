const STORAGE_KEY = 'hf_loan_items_v4';

let loanItems = [];
let filterCondition = null;
let editingLoanId = null;
let refreshTimer = null;
let currentStatType = 'total';

const els = {};

document.addEventListener('DOMContentLoaded', function() {
    bindElements();
    bindEvents();
    loadFromStorage();
    updateSummary();
    updateLoanList();
    updateFilterResult();
});

function bindElements() {
    els.loanName = document.getElementById('loan-name');
    els.loanAmount = document.getElementById('loan-amount');
    els.monthlyPayment = document.getElementById('monthly-payment');
    els.loanTerm = document.getElementById('loan-term');
    els.paidPeriods = document.getElementById('paid-periods');
    els.repaymentDay = document.getElementById('repayment-day');
    els.formTitle = document.getElementById('form-title');
    els.formModeTag = document.getElementById('form-mode-tag');
    els.addLoanBtn = document.getElementById('add-loan-btn');
    els.cancelEditBtn = document.getElementById('cancel-edit-btn');

    els.annualRate = document.getElementById('annual-rate');
    els.totalPayment = document.getElementById('total-payment');
    els.totalInterest = document.getElementById('total-interest');

    els.totalLoanAmount = document.getElementById('total-loan-amount');
    els.totalMonthlyPayment = document.getElementById('total-monthly-payment');
    els.loanCount = document.getElementById('loan-count');
    els.currentMonthPayment = document.getElementById('current-month-payment');
    els.nextRepaymentDay = document.getElementById('next-repayment-day');
    els.repaymentProgress = document.getElementById('repayment-progress');

    els.loanList = document.getElementById('loan-list');
    els.loanDetailSection = document.getElementById('loan-detail-section');
    els.loanDetail = document.getElementById('loan-detail');

    els.filterType = document.getElementById('filter-type');
    els.singleDate = document.getElementById('single-date');
    els.startDate = document.getElementById('start-date');
    els.endDate = document.getElementById('end-date');
    els.singleDateContainer = document.getElementById('single-date-container');
    els.rangeDateContainer = document.getElementById('range-date-container');
    els.endDateContainer = document.getElementById('end-date-container');
    els.searchKeyword = document.getElementById('search-keyword');
    els.statusFilter = document.getElementById('status-filter');
    els.sortType = document.getElementById('sort-type');

    els.filterConditionText = document.getElementById('filter-condition');
    els.filteredCount = document.getElementById('filtered-count');
    els.dailyPaymentTotal = document.getElementById('daily-payment-total');
}

function bindEvents() {
    document.getElementById('calculate-btn').addEventListener('click', calculateRate);
    els.addLoanBtn.addEventListener('click', addLoanItem);
    els.cancelEditBtn.addEventListener('click', cancelEdit);
    document.getElementById('import-btn').addEventListener('click', importRecords);
    document.getElementById('export-btn').addEventListener('click', exportRecords);
    document.getElementById('filter-btn').addEventListener('click', applyFilter);
    document.getElementById('reset-filter-btn').addEventListener('click', resetFilter);

    els.filterType.addEventListener('change', toggleDateFilterInputs);
    els.searchKeyword.addEventListener('input', debouncedRefresh);
    els.statusFilter.addEventListener('change', debouncedRefresh);
    els.sortType.addEventListener('change', debouncedRefresh);

    // Loan type selector events
    const loanTypeSelector = document.getElementById('loan-type-selector');
    if (loanTypeSelector) {
        loanTypeSelector.addEventListener('click', function(e) {
            const option = e.target.closest('.loan-type-option');
            if (option) {
                selectLoanType(option.dataset.type);
            }
        });
    }

    // Stat tab events
    const statTabs = document.querySelectorAll('.stat-tab');
    statTabs.forEach(tab => {
        tab.addEventListener('click', function() {
            const type = this.dataset.type;
            statTabs.forEach(t => t.classList.remove('active'));
            this.classList.add('active');
            currentStatType = type;
            updateEnhancedStats();
        });
    });

    // Credit card specific events
    const creditUsed = document.getElementById('credit-used');
    const creditLimit = document.getElementById('credit-limit');
    if (creditUsed && creditLimit) {
        creditUsed.addEventListener('input', updateCreditUsedPercentage);
        creditLimit.addEventListener('input', updateCreditUsedPercentage);
    }

    // Amount calculation hints
    els.loanAmount.addEventListener('input', calculateAmountHint);
    els.monthlyPayment.addEventListener('input', calculatePaymentHint);

    // Form validation
    els.loanAmount.addEventListener('blur', validateAmount);
    els.monthlyPayment.addEventListener('blur', validatePayment);
}

function toggleDateFilterInputs() {
    const filterType = els.filterType.value;
    els.singleDateContainer.style.display = filterType === 'single' ? 'block' : 'none';
    els.rangeDateContainer.style.display = filterType === 'range' ? 'block' : 'none';
    els.endDateContainer.style.display = filterType === 'range' ? 'block' : 'none';
}

function calculateRate() {
    const values = getFormValues();
    if (!values.valid) {
        alert(values.message);
        return;
    }

    const totalPayment = values.monthlyPayment * values.loanTerm;
    const totalInterest = totalPayment - values.loanAmount;
    const annualRate = calculateAnnualRate(values.loanAmount, values.monthlyPayment, values.loanTerm);

    els.annualRate.textContent = annualRate.toFixed(2) + '%';
    els.totalPayment.textContent = formatCurrency(totalPayment);
    els.totalInterest.textContent = formatCurrency(totalInterest);
}

function calculateAnnualRate(loanAmount, monthlyPayment, loanTerm) {
    let low = 0;
    let high = 1;
    const tolerance = 1e-7; // 年化率精度 0.001%

    while (high - low > tolerance) {
        const mid = (low + high) / 2;
        const monthlyRate = mid / 12;
        const denominator = Math.pow(1 + monthlyRate, loanTerm) - 1;
        const calculatedPayment = denominator === 0
            ? loanAmount / loanTerm
            : loanAmount * monthlyRate * Math.pow(1 + monthlyRate, loanTerm) / denominator;

        if (calculatedPayment > monthlyPayment) {
            high = mid;
        } else {
            low = mid;
        }
    }

    return (low + high) / 2 * 100;
}

function getFormValues() {
    const loanName = els.loanName.value.trim();
    const loanAmount = parseFloat(els.loanAmount.value);
    const monthlyPayment = parseFloat(els.monthlyPayment.value);
    const loanTerm = parseInt(els.loanTerm.value, 10);
    const paidPeriods = parseInt(els.paidPeriods.value, 10) || 0;
    const repaymentDay = parseInt(els.repaymentDay.value, 10);

    const loanType = document.querySelector('.loan-type-option.selected')?.dataset.type || 'loan';
    const isInterestFree = loanType === 'personal' && document.getElementById('is-interest-free')?.checked;

    if (isInterestFree) {
        if (!loanName || isNaN(loanAmount) || isNaN(monthlyPayment)) {
            return { valid: false, message: '请填写贷款项目名称、借款金额和月供金额' };
        }
        if (loanAmount <= 0 || monthlyPayment <= 0) {
            return { valid: false, message: '请输入有效的数值' };
        }
    } else {
        if (!loanName || isNaN(loanAmount) || isNaN(monthlyPayment) || isNaN(loanTerm) || isNaN(repaymentDay)) {
            return { valid: false, message: '请填写所有必填字段' };
        }

        if (loanAmount <= 0 || monthlyPayment <= 0 || loanTerm <= 0 || repaymentDay <= 0 || repaymentDay > 31) {
            return { valid: false, message: '请输入有效的数值' };
        }

        if (isNaN(paidPeriods) || paidPeriods < 0 || paidPeriods > loanTerm) {
            return { valid: false, message: '已还款期数必须在0到贷款期限之间' };
        }

        // Validate loan amount vs monthly payment
        const totalPayment = monthlyPayment * loanTerm;
        if (totalPayment < loanAmount) {
            return { valid: false, message: '月供金额过小，无法在贷款期限内还清本金' };
        }
    }

    return {
        valid: true,
        loanName,
        loanAmount,
        monthlyPayment,
        loanTerm: isInterestFree ? 0 : loanTerm,
        paidPeriods: isInterestFree ? 0 : paidPeriods,
        repaymentDay: isInterestFree ? 0 : repaymentDay
    };
}

function selectLoanType(type) {
    // Update selected state
    document.querySelectorAll('.loan-type-option').forEach(option => {
        option.classList.remove('selected');
    });
    document.querySelector(`[data-type="${type}"]`).classList.add('selected');

    // Show/hide type-specific fields
    const creditFields = document.getElementById('credit-card-fields');
    const personalFields = document.getElementById('personal-loan-fields');

    if (type === 'credit') {
        // 弹出信用卡简化表单
        showCreditCardPopup();
        creditFields.classList.remove('active');
        personalFields.classList.remove('active');
        els.loanAmount.setAttribute('placeholder', '欠款总额');
        els.monthlyPayment.setAttribute('placeholder', '最低还款额');
    } else if (type === 'personal') {
        // 弹出个人借款简化表单
        showPersonalLoanPopup();
        creditFields.classList.remove('active');
        personalFields.classList.remove('active');
        els.loanAmount.setAttribute('placeholder', '借款金额');
        els.monthlyPayment.setAttribute('placeholder', '月还款额');
    } else {
        // 弹出银行贷款简化表单
        showBankLoanPopup();
        creditFields.classList.remove('active');
        personalFields.classList.remove('active');
        els.loanAmount.setAttribute('placeholder', '请输入贷款金额');
        els.monthlyPayment.setAttribute('placeholder', '请输入月供金额');
    }

    // Clear type-specific fields
    clearTypeSpecificFields();
}

function clearTypeSpecificFields() {
    // Clear credit card fields
    document.getElementById('credit-limit').value = '';
    document.getElementById('credit-used').value = '';
    document.getElementById('min-payment').value = '';
    document.getElementById('interest-rate').value = '';
    document.getElementById('is-revolving').checked = false;

    // Clear personal loan fields
    document.getElementById('borrower-name').value = '';
    document.getElementById('borrower-phone').value = '';
    document.getElementById('collateral').value = '';
    document.getElementById('contract-no').value = '';
    document.getElementById('is-interest-free').checked = false;
}

function showPersonalLoanPopup() {
    // 创建弹出层
    const popup = document.createElement('div');
    popup.className = 'personal-loan-popup';
    popup.innerHTML = `
        <div class="popup-content">
            <h3>个人借款</h3>
            <div class="input-group">
                <label for="popup-borrower-name">借款人</label>
                <input type="text" id="popup-borrower-name" placeholder="请输入借款人姓名">
            </div>
            <div class="input-group">
                <label for="popup-loan-amount">借款金额（元）</label>
                <input type="number" id="popup-loan-amount" placeholder="请输入借款金额" min="1">
            </div>
            <div class="input-group">
                <label for="popup-repayment-day">还款日期（1-31，0表示有钱时再归还）</label>
                <input type="number" id="popup-repayment-day" placeholder="请输入还款日期" min="0" max="31">
            </div>
            <div class="input-group">
                <label for="popup-paid-amount">已还金额（元）</label>
                <input type="number" id="popup-paid-amount" placeholder="请输入已还金额" min="0" value="0">
            </div>
            <div class="button-group">
                <button id="popup-confirm-btn">确认添加</button>
                <button id="popup-cancel-btn" class="secondary-btn">取消</button>
            </div>
        </div>
    `;
    
    // 添加到页面
    document.body.appendChild(popup);
    
    // 添加事件监听
    document.getElementById('popup-confirm-btn').addEventListener('click', function() {
        const borrowerName = document.getElementById('popup-borrower-name').value.trim();
        const loanAmount = parseFloat(document.getElementById('popup-loan-amount').value);
        const repaymentDay = parseInt(document.getElementById('popup-repayment-day').value, 10);
        const paidAmount = parseFloat(document.getElementById('popup-paid-amount').value) || 0;
        
        if (!borrowerName || isNaN(loanAmount)) {
            alert('请填写借款人姓名和借款金额');
            return;
        }
        
        if (loanAmount <= 0) {
            alert('请输入有效的借款金额');
            return;
        }
        
        if (isNaN(repaymentDay) || repaymentDay < 0 || repaymentDay > 31) {
            alert('请输入有效的还款日期（0-31）');
            return;
        }
        
        if (paidAmount < 0 || paidAmount > loanAmount) {
            alert('已还金额必须在0到借款金额之间');
            return;
        }
        
        // 创建个人借款项目
        const remainingAmount = loanAmount - paidAmount;
        const item = {
            id: Date.now() + Math.floor(Math.random() * 1000),
            name: `个人借款 - ${borrowerName}`,
            amount: loanAmount,
            monthlyPayment: 0,
            term: 0,
            repaymentDay: repaymentDay,
            annualRate: 0,
            totalPayment: loanAmount,
            totalInterest: 0,
            paidPeriods: 0,
            paidAmount: paidAmount,
            remainingAmount: remainingAmount,
            loanType: 'personal',
            borrowerName: borrowerName,
            isInterestFree: true,
            createdAt: Date.now()
        };
        
        loanItems.push(item);
        saveToStorage();
        refreshAllViews();
        updatePersonalLoanList();
        
        // 关闭弹出层
        document.body.removeChild(popup);
        alert('个人借款添加成功！');
    });
    
    document.getElementById('popup-cancel-btn').addEventListener('click', function() {
        document.body.removeChild(popup);
    });
    
    // 点击外部关闭
    popup.addEventListener('click', function(e) {
        if (e.target === popup) {
            document.body.removeChild(popup);
        }
    });
}

function showBankLoanPopup() {
    // 创建弹出层
    const popup = document.createElement('div');
    popup.className = 'personal-loan-popup';
    popup.innerHTML = `
        <div class="popup-content">
            <h3>银行贷款</h3>
            <div class="input-group">
                <label for="popup-loan-name">贷款项目名称</label>
                <input type="text" id="popup-loan-name" placeholder="请输入贷款项目名称">
            </div>
            <div class="input-group">
                <label for="popup-loan-amount">贷款金额（元）</label>
                <input type="number" id="popup-loan-amount" placeholder="请输入贷款金额" min="1">
            </div>
            <div class="input-group">
                <label for="popup-monthly-payment">月供金额（元）</label>
                <input type="number" id="popup-monthly-payment" placeholder="请输入月供金额" min="1">
            </div>
            <div class="input-group">
                <label for="popup-loan-term">贷款期限（月）</label>
                <input type="number" id="popup-loan-term" placeholder="请输入贷款期限" min="1">
            </div>
            <div class="input-group">
                <label for="popup-repayment-day">每月还款日</label>
                <input type="number" id="popup-repayment-day" placeholder="请输入每月还款日" min="1" max="31">
            </div>
            <div class="input-group">
                <label for="popup-paid-periods">已还款期数</label>
                <input type="number" id="popup-paid-periods" placeholder="请输入已还款期数" min="0" value="0">
            </div>
            <div class="button-group">
                <button id="popup-confirm-btn">确认添加</button>
                <button id="popup-cancel-btn" class="secondary-btn">取消</button>
            </div>
        </div>
    `;
    
    // 添加到页面
    document.body.appendChild(popup);
    
    // 添加事件监听
    document.getElementById('popup-confirm-btn').addEventListener('click', function() {
        const loanName = document.getElementById('popup-loan-name').value.trim();
        const loanAmount = parseFloat(document.getElementById('popup-loan-amount').value);
        const monthlyPayment = parseFloat(document.getElementById('popup-monthly-payment').value);
        const loanTerm = parseInt(document.getElementById('popup-loan-term').value, 10);
        const repaymentDay = parseInt(document.getElementById('popup-repayment-day').value, 10);
        const paidPeriods = parseInt(document.getElementById('popup-paid-periods').value, 10) || 0;
        
        if (!loanName || isNaN(loanAmount) || isNaN(monthlyPayment) || isNaN(loanTerm) || isNaN(repaymentDay)) {
            alert('请填写所有必填字段');
            return;
        }
        
        if (loanAmount <= 0 || monthlyPayment <= 0 || loanTerm <= 0 || repaymentDay <= 0 || repaymentDay > 31) {
            alert('请输入有效的数值');
            return;
        }
        
        if (isNaN(paidPeriods) || paidPeriods < 0 || paidPeriods > loanTerm) {
            alert('已还款期数必须在0到贷款期限之间');
            return;
        }
        
        // Validate loan amount vs monthly payment
        const totalPayment = monthlyPayment * loanTerm;
        if (totalPayment < loanAmount) {
            alert('月供金额过小，无法在贷款期限内还清本金');
            return;
        }
        
        // 计算年化利率
        const annualRate = calculateAnnualRate(loanAmount, monthlyPayment, loanTerm);
        const totalInterest = totalPayment - loanAmount;
        const paidAmount = monthlyPayment * paidPeriods;
        const remainingAmount = Math.max(0, totalPayment - paidAmount);
        
        // 创建银行贷款项目
        const item = {
            id: Date.now() + Math.floor(Math.random() * 1000),
            name: loanName,
            amount: loanAmount,
            monthlyPayment: monthlyPayment,
            term: loanTerm,
            repaymentDay: repaymentDay,
            annualRate: annualRate,
            totalPayment: totalPayment,
            totalInterest: totalInterest,
            paidPeriods: paidPeriods,
            paidAmount: paidAmount,
            remainingAmount: remainingAmount,
            loanType: 'loan',
            createdAt: Date.now()
        };
        
        loanItems.push(item);
        saveToStorage();
        refreshAllViews();
        
        // 关闭弹出层
        document.body.removeChild(popup);
        alert('银行贷款添加成功！');
    });
    
    document.getElementById('popup-cancel-btn').addEventListener('click', function() {
        document.body.removeChild(popup);
    });
    
    // 点击外部关闭
    popup.addEventListener('click', function(e) {
        if (e.target === popup) {
            document.body.removeChild(popup);
        }
    });
}

function showCreditCardPopup() {
    // 创建弹出层
    const popup = document.createElement('div');
    popup.className = 'personal-loan-popup';
    popup.innerHTML = `
        <div class="popup-content">
            <h3>信用卡</h3>
            <div class="input-group">
                <label for="popup-card-name">信用卡名称</label>
                <input type="text" id="popup-card-name" placeholder="请输入信用卡名称">
            </div>
            <div class="input-group">
                <label for="popup-credit-limit">信用额度（元）</label>
                <input type="number" id="popup-credit-limit" placeholder="请输入信用额度" min="0">
            </div>
            <div class="input-group">
                <label for="popup-credit-used">已用额度（元）</label>
                <input type="number" id="popup-credit-used" placeholder="请输入已用额度" min="0">
            </div>
            <div class="input-group">
                <label for="popup-min-payment">最低还款额（元）</label>
                <input type="number" id="popup-min-payment" placeholder="请输入最低还款额" min="0">
            </div>
            <div class="input-group">
                <label for="popup-interest-rate">日利率（%）</label>
                <input type="number" id="popup-interest-rate" placeholder="请输入日利率" min="0" max="100" step="0.0001">
                <div class="input-hint">例如：0.05% 写 0.05</div>
            </div>
            <div class="input-group">
                <label>
                    <input type="checkbox" id="popup-is-revolving"> 是否循环利息
                </label>
            </div>
            <div class="button-group">
                <button id="popup-confirm-btn">确认添加</button>
                <button id="popup-cancel-btn" class="secondary-btn">取消</button>
            </div>
        </div>
    `;
    
    // 添加到页面
    document.body.appendChild(popup);
    
    // 添加事件监听
    document.getElementById('popup-confirm-btn').addEventListener('click', function() {
        const cardName = document.getElementById('popup-card-name').value.trim();
        const creditLimit = parseFloat(document.getElementById('popup-credit-limit').value) || 0;
        const creditUsed = parseFloat(document.getElementById('popup-credit-used').value) || 0;
        const minPayment = parseFloat(document.getElementById('popup-min-payment').value) || 0;
        const interestRate = parseFloat(document.getElementById('popup-interest-rate').value) || 0;
        const isRevolving = document.getElementById('popup-is-revolving').checked;
        
        if (!cardName || isNaN(creditUsed)) {
            alert('请填写信用卡名称和已用额度');
            return;
        }
        
        if (creditUsed < 0) {
            alert('请输入有效的已用额度');
            return;
        }
        
        // 计算年化利率（日利率转换为年化）
        const annualRate = interestRate * 365;
        const totalPayment = creditUsed;
        const totalInterest = 0; // 信用卡利息按日计算，这里简化处理
        const paidAmount = 0;
        const remainingAmount = creditUsed;
        
        // 创建信用卡项目
        const item = {
            id: Date.now() + Math.floor(Math.random() * 1000),
            name: `信用卡 - ${cardName}`,
            amount: creditUsed,
            monthlyPayment: minPayment,
            term: 0,
            repaymentDay: 0,
            annualRate: annualRate,
            totalPayment: totalPayment,
            totalInterest: totalInterest,
            paidPeriods: 0,
            paidAmount: paidAmount,
            remainingAmount: remainingAmount,
            loanType: 'credit',
            creditLimit: creditLimit,
            creditUsed: creditUsed,
            minPayment: minPayment,
            interestRate: interestRate,
            isRevolving: isRevolving,
            usedPercentage: creditLimit > 0 ? (creditUsed / creditLimit) * 100 : 0,
            createdAt: Date.now()
        };
        
        loanItems.push(item);
        saveToStorage();
        refreshAllViews();
        
        // 关闭弹出层
        document.body.removeChild(popup);
        alert('信用卡添加成功！');
    });
    
    document.getElementById('popup-cancel-btn').addEventListener('click', function() {
        document.body.removeChild(popup);
    });
    
    // 点击外部关闭
    popup.addEventListener('click', function(e) {
        if (e.target === popup) {
            document.body.removeChild(popup);
        }
    });
}

function updatePersonalLoanList() {
    const personalLoans = loanItems.filter(item => item.loanType === 'personal');
    const personalLoanList = document.getElementById('personal-loan-list');
    
    if (!personalLoanList) return;
    
    const isMobile = window.innerWidth <= 768;
    
    if (personalLoans.length === 0) {
        personalLoanList.innerHTML = '<p class="empty-message">暂无个人借款项目</p>';
        return;
    }
    
    if (isMobile) {
        const cards = personalLoans.map(item => `
            <div class="mobile-card">
                <div class="mobile-card-header">
                    <div class="mobile-card-title">${escapeHtml(item.name)}</div>
                    <span class="status-badge ${item.remainingAmount > 0 ? 'active' : 'completed'}">${item.remainingAmount > 0 ? '未结清' : '已结清'}</span>
                </div>
                <div class="mobile-card-body">
                    <div class="mobile-card-row">
                        <span class="mobile-card-label">借款人</span>
                        <span class="mobile-card-value">${escapeHtml(item.borrowerName)}</span>
                    </div>
                    <div class="mobile-card-row">
                        <span class="mobile-card-label">借款金额</span>
                        <span class="mobile-card-value">${formatCurrency(item.amount)}</span>
                    </div>
                    <div class="mobile-card-row">
                        <span class="mobile-card-label">还款日期</span>
                        <span class="mobile-card-value">${item.repaymentDay > 0 ? '每月' + item.repaymentDay + '日' : '有钱时再归还'}</span>
                    </div>
                    <div class="mobile-card-row">
                        <span class="mobile-card-label">已还金额</span>
                        <span class="mobile-card-value">${formatCurrency(item.paidAmount)}</span>
                    </div>
                    <div class="mobile-card-row highlight">
                        <span class="mobile-card-label">未还金额</span>
                        <span class="mobile-card-value">${formatCurrency(item.remainingAmount)}</span>
                    </div>
                </div>
                <div class="mobile-card-actions">
                    <button class="view-btn" onclick="showLoanDetail(${item.id});">详细</button>
                    <button class="edit-btn" onclick="startEditLoan(${item.id});">编辑</button>
                    <button class="delete-btn" onclick="deleteLoanItem(${item.id});">删除</button>
                </div>
            </div>
        `).join('');
        personalLoanList.innerHTML = cards;
    } else {
        const table = `
            <table class="loan-table">
                <thead>
                    <tr>
                        <th>借款项目</th>
                        <th>借款人</th>
                        <th>借款金额</th>
                        <th>还款日期</th>
                        <th>已还金额</th>
                        <th>未还金额</th>
                        <th>状态</th>
                        <th>操作</th>
                    </tr>
                </thead>
                <tbody>
                    ${personalLoans.map(item => `
                        <tr>
                            <td>${escapeHtml(item.name)}</td>
                            <td>${escapeHtml(item.borrowerName)}</td>
                            <td>${formatCurrency(item.amount)}</td>
                            <td>${item.repaymentDay > 0 ? '每月' + item.repaymentDay + '日' : '有钱时再归还'}</td>
                            <td>${formatCurrency(item.paidAmount)}</td>
                            <td>${formatCurrency(item.remainingAmount)}</td>
                            <td><span class="status-badge ${item.remainingAmount > 0 ? 'active' : 'completed'}">${item.remainingAmount > 0 ? '未结清' : '已结清'}</span></td>
                            <td>
                                <button class="view-btn" onclick="showLoanDetail(${item.id});">详细</button>
                                <button class="edit-btn" onclick="startEditLoan(${item.id});">编辑</button>
                                <button class="delete-btn" onclick="deleteLoanItem(${item.id});">删除</button>
                            </td>
                        </tr>
                    `).join('')}
                </tbody>
            </table>
        `;
        personalLoanList.innerHTML = table;
    }
}

function updateCreditCardList() {
    const creditCards = loanItems.filter(item => item.loanType === 'credit');
    const creditCardList = document.getElementById('credit-card-list');
    
    if (!creditCardList) return;
    
    const isMobile = window.innerWidth <= 768;
    
    if (creditCards.length === 0) {
        creditCardList.innerHTML = '<p class="empty-message">暂无信用卡项目</p>';
        return;
    }
    
    if (isMobile) {
        const cards = creditCards.map(item => `
            <div class="mobile-card">
                <div class="mobile-card-header">
                    <div class="mobile-card-title">${escapeHtml(item.name)}</div>
                    <span class="status-badge ${item.remainingAmount > 0 ? 'active' : 'completed'}">${item.remainingAmount > 0 ? '未结清' : '已结清'}</span>
                </div>
                <div class="mobile-card-body">
                    <div class="mobile-card-row">
                        <span class="mobile-card-label">信用额度</span>
                        <span class="mobile-card-value">${formatCurrency(item.creditLimit)}</span>
                    </div>
                    <div class="mobile-card-row">
                        <span class="mobile-card-label">已用额度</span>
                        <span class="mobile-card-value">${formatCurrency(item.creditUsed)}</span>
                    </div>
                    <div class="mobile-card-row">
                        <span class="mobile-card-label">最低还款额</span>
                        <span class="mobile-card-value">${formatCurrency(item.minPayment)}</span>
                    </div>
                    <div class="mobile-card-row highlight">
                        <span class="mobile-card-label">未还金额</span>
                        <span class="mobile-card-value">${formatCurrency(item.remainingAmount)}</span>
                    </div>
                </div>
                <div class="mobile-card-actions">
                    <button class="view-btn" onclick="showLoanDetail(${item.id});">详细</button>
                    <button class="edit-btn" onclick="startEditLoan(${item.id});">编辑</button>
                    <button class="delete-btn" onclick="deleteLoanItem(${item.id});">删除</button>
                </div>
            </div>
        `).join('');
        creditCardList.innerHTML = cards;
    } else {
        const table = `
            <table class="loan-table">
                <thead>
                    <tr>
                        <th>信用卡名称</th>
                        <th>信用额度</th>
                        <th>已用额度</th>
                        <th>最低还款额</th>
                        <th>未还金额</th>
                        <th>状态</th>
                        <th>操作</th>
                    </tr>
                </thead>
                <tbody>
                    ${creditCards.map(item => `
                        <tr>
                            <td>${escapeHtml(item.name)}</td>
                            <td>${formatCurrency(item.creditLimit)}</td>
                            <td>${formatCurrency(item.creditUsed)}</td>
                            <td>${formatCurrency(item.minPayment)}</td>
                            <td>${formatCurrency(item.remainingAmount)}</td>
                            <td><span class="status-badge ${item.remainingAmount > 0 ? 'active' : 'completed'}">${item.remainingAmount > 0 ? '未结清' : '已结清'}</span></td>
                            <td>
                                <button class="view-btn" onclick="showLoanDetail(${item.id});">详细</button>
                                <button class="edit-btn" onclick="startEditLoan(${item.id});">编辑</button>
                                <button class="delete-btn" onclick="deleteLoanItem(${item.id});">删除</button>
                            </td>
                        </tr>
                    `).join('')}
                </tbody>
            </table>
        `;
        creditCardList.innerHTML = table;
    }
}

function buildLoanItem(values, existingId) {
    let annualRate = 0;
    let totalPayment = 0;
    let totalInterest = 0;
    let paidAmount = 0;
    let remainingAmount = 0;

    if (values.loanTerm > 0) {
        annualRate = calculateAnnualRate(values.loanAmount, values.monthlyPayment, values.loanTerm);
        totalPayment = values.monthlyPayment * values.loanTerm;
        totalInterest = totalPayment - values.loanAmount;
        paidAmount = values.monthlyPayment * values.paidPeriods;
        remainingAmount = Math.max(0, totalPayment - paidAmount);
    } else {
        // 无息借款
        annualRate = 0;
        totalPayment = values.loanAmount;
        totalInterest = 0;
        paidAmount = 0;
        remainingAmount = values.loanAmount;
    }

    // Get current loan type
    const loanType = document.querySelector('.loan-type-option.selected')?.dataset.type || 'loan';

    // Base loan item
    const item = {
        id: existingId || Date.now() + Math.floor(Math.random() * 1000),
        name: values.loanName,
        amount: values.loanAmount,
        monthlyPayment: values.monthlyPayment,
        term: values.loanTerm,
        repaymentDay: values.repaymentDay,
        annualRate,
        totalPayment,
        totalInterest,
        paidPeriods: values.paidPeriods,
        paidAmount,
        remainingAmount,
        loanType: loanType,
        createdAt: existingId ? undefined : Date.now()
    };

    // Add type-specific fields
    if (loanType === 'credit') {
        item.creditLimit = parseFloat(document.getElementById('credit-limit').value) || 0;
        item.creditUsed = parseFloat(document.getElementById('credit-used').value) || 0;
        item.minPayment = parseFloat(document.getElementById('min-payment').value) || 0;
        item.interestRate = parseFloat(document.getElementById('interest-rate').value) || 0;
        item.isRevolving = document.getElementById('is-revolving').checked;
        item.usedPercentage = item.creditLimit > 0 ? (item.creditUsed / item.creditLimit) * 100 : 0;
    } else if (loanType === 'personal') {
        item.borrowerName = document.getElementById('borrower-name').value || '';
        item.borrowerPhone = document.getElementById('borrower-phone').value || '';
        item.collateral = document.getElementById('collateral').value || '';
        item.contractNo = document.getElementById('contract-no').value || '';
        item.isInterestFree = document.getElementById('is-interest-free').checked;
        if (item.isInterestFree) {
            item.annualRate = 0;
            item.totalInterest = 0;
        }
    }

    return item;
}

function addLoanItem() {
    const values = getFormValues();
    if (!values.valid) {
        alert(values.message);
        return;
    }

    if (editingLoanId) {
        const index = loanItems.findIndex(item => item.id === editingLoanId);
        if (index === -1) return;

        const updated = buildLoanItem(values, editingLoanId);
        updated.createdAt = loanItems[index].createdAt || Date.now();
        loanItems[index] = updated;
        alert('贷款项目已更新');
        cancelEdit(false);
    } else {
        loanItems.push(buildLoanItem(values));
        alert('贷款项目添加成功');
        clearForm();
    }

    saveToStorage();
    refreshAllViews();
}

function startEditLoan(id) {
    const item = loanItems.find(loan => loan.id === id);
    if (!item) return;

    editingLoanId = id;
    els.formTitle.textContent = '编辑贷款项目';
    els.formModeTag.textContent = '编辑中';
    els.addLoanBtn.textContent = '保存修改';
    els.cancelEditBtn.style.display = 'inline-flex';

    els.loanName.value = item.name;
    els.loanAmount.value = item.amount;
    els.monthlyPayment.value = item.monthlyPayment;
    els.loanTerm.value = item.term;
    els.paidPeriods.value = item.paidPeriods;
    els.repaymentDay.value = item.repaymentDay;

    window.scrollTo({ top: 0, behavior: 'smooth' });
}

function cancelEdit(clear = true) {
    editingLoanId = null;
    els.formTitle.textContent = '添加贷款项目';
    els.formModeTag.textContent = '新增';
    els.addLoanBtn.textContent = '添加贷款项目';
    els.cancelEditBtn.style.display = 'none';

    if (clear) {
        clearForm();
    }
}

function clearForm() {
    els.loanName.value = '';
    els.loanAmount.value = '';
    els.monthlyPayment.value = '';
    els.loanTerm.value = '';
    els.paidPeriods.value = '0';
    els.repaymentDay.value = '';
}

function deleteLoanItem(id) {
    if (!confirm('确定要删除这个贷款项目吗？此操作不可恢复。')) {
        return;
    }

    loanItems = loanItems.filter(item => item.id !== id);
    if (editingLoanId === id) {
        cancelEdit();
    }

    if (els.loanDetailSection.style.display === 'block') {
        els.loanDetailSection.style.display = 'none';
    }

    saveToStorage();
    refreshAllViews();
    alert('贷款项目删除成功！');
}

function showLoanDetail(id) {
    const loanItem = loanItems.find(item => item.id === id);
    if (!loanItem) return;

    if (loanItem.term > 0) {
        const repaymentSchedule = generateRepaymentSchedule(loanItem);

        els.loanDetail.innerHTML = `
            <h3>${escapeHtml(loanItem.name)} - 还款计划</h3>
            <table>
                <thead>
                    <tr>
                        <th>期数</th>
                        <th>还款日期</th>
                        <th>月供</th>
                        <th>本金</th>
                        <th>利息</th>
                        <th>剩余本金</th>
                        <th>状态</th>
                    </tr>
                </thead>
                <tbody>
                    ${repaymentSchedule.map(schedule => `
                        <tr class="${schedule.period <= loanItem.paidPeriods ? 'paid' : ''}">
                            <td>${schedule.period}</td>
                            <td>${schedule.date}</td>
                            <td>${schedule.payment.toFixed(2)}</td>
                            <td>${schedule.principal.toFixed(2)}</td>
                            <td>${schedule.interest.toFixed(2)}</td>
                            <td>${schedule.remainingPrincipal.toFixed(2)}</td>
                            <td>
                                ${schedule.period <= loanItem.paidPeriods
                                    ? '<span class="paid-status">已还款</span>'
                                    : `<button class="repay-btn" onclick="repayLoan(${loanItem.id}, ${schedule.period});">还款</button>`}
                            </td>
                        </tr>
                    `).join('')}
                </tbody>
            </table>
        `;
    } else {
        // 无息借款详情
        els.loanDetail.innerHTML = `
            <h3>${escapeHtml(loanItem.name)} - 借款详情</h3>
            <div class="loan-detail-info">
                <div class="result-item">
                    <span class="label">借款金额：</span>
                    <span class="value">${formatCurrency(loanItem.amount)}</span>
                </div>
                <div class="result-item">
                    <span class="label">每月还款：</span>
                    <span class="value">${formatCurrency(loanItem.monthlyPayment)}</span>
                </div>
                <div class="result-item">
                    <span class="label">总还款额：</span>
                    <span class="value">${formatCurrency(loanItem.totalPayment)}</span>
                </div>
                <div class="result-item">
                    <span class="label">总利息：</span>
                    <span class="value">${formatCurrency(loanItem.totalInterest)}</span>
                </div>
                <div class="result-item">
                    <span class="label">已还金额：</span>
                    <span class="value">${formatCurrency(loanItem.paidAmount)}</span>
                </div>
                <div class="result-item">
                    <span class="label">未还金额：</span>
                    <span class="value">${formatCurrency(loanItem.remainingAmount)}</span>
                </div>
                <div class="result-item">
                    <span class="label">借款类型：</span>
                    <span class="value">个人借款 (无息)</span>
                </div>
                ${loanItem.borrowerName ? `<div class="result-item"><span class="label">借款人：</span><span class="value">${escapeHtml(loanItem.borrowerName)}</span></div>` : ''}
                ${loanItem.borrowerPhone ? `<div class="result-item"><span class="label">联系方式：</span><span class="value">${escapeHtml(loanItem.borrowerPhone)}</span></div>` : ''}
            </div>
        `;
    }

    els.loanDetailSection.style.display = 'block';
}

function generateRepaymentSchedule(loanItem) {
    const schedule = [];
    const monthlyRate = loanItem.annualRate / 100 / 12;
    let remainingPrincipal = loanItem.amount;
    const paidPeriods = loanItem.paidPeriods || 0;

    for (let i = 1; i <= loanItem.term; i++) {
        const interest = remainingPrincipal * monthlyRate;
        const principal = loanItem.monthlyPayment - interest;
        remainingPrincipal -= principal;

        if (i === loanItem.term) {
            remainingPrincipal = 0;
        }

        const date = new Date();
        date.setMonth(date.getMonth() + i - paidPeriods);
        date.setDate(loanItem.repaymentDay);

        if (date.getDate() !== loanItem.repaymentDay) {
            date.setDate(0);
        }

        const formattedDate = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;

        schedule.push({
            period: i,
            date: formattedDate,
            payment: loanItem.monthlyPayment,
            principal,
            interest,
            remainingPrincipal: Math.max(0, remainingPrincipal)
        });
    }

    return schedule;
}

function repayLoan(id, period) {
    const loanItem = loanItems.find(item => item.id === id);
    if (!loanItem) return;

    if (loanItem.paidPeriods >= loanItem.term) {
        alert('该贷款已全部还清');
        return;
    }

    if (period <= loanItem.paidPeriods || period > loanItem.term) {
        alert('无效的还款期数');
        return;
    }

    const repaymentAmount = loanItem.monthlyPayment * (period - loanItem.paidPeriods);

    if (loanItem.paidAmount + repaymentAmount > loanItem.totalPayment) {
        alert('还款金额超过总还款额');
        return;
    }

    loanItem.paidPeriods = period;
    loanItem.paidAmount += repaymentAmount;
    loanItem.remainingAmount = Math.max(0, loanItem.remainingAmount - repaymentAmount);

    saveToStorage();
    refreshAllViews();
    showLoanDetail(id);
    alert('还款成功！');
}

function updateSummary() {
    if (loanItems.length === 0) {
        els.totalLoanAmount.textContent = '--元';
        els.totalMonthlyPayment.textContent = '--元';
        els.loanCount.textContent = '--个';
        els.currentMonthPayment.textContent = '--元';
        els.nextRepaymentDay.textContent = '--';
        els.repaymentProgress.textContent = '--%';
        return;
    }

    const activeItems = loanItems.filter(item => item.paidPeriods < item.term);
    const totalLiability = loanItems.reduce((sum, item) => sum + item.remainingAmount, 0);
    const totalMonthlyPayment = activeItems.reduce((sum, item) => sum + item.monthlyPayment, 0);
    const totalPaidAmount = loanItems.reduce((sum, item) => sum + item.paidAmount, 0);
    const totalPayable = loanItems.reduce((sum, item) => sum + item.totalPayment, 0);
    const nextRepaymentDay = activeItems.length > 0
        ? Math.min(...activeItems.map(item => item.repaymentDay)) + '日'
        : '无';
    const progress = totalPayable > 0 ? (totalPaidAmount / totalPayable) * 100 : 0;

    els.totalLoanAmount.textContent = formatCurrency(totalLiability);
    els.totalMonthlyPayment.textContent = formatCurrency(totalMonthlyPayment);
    els.loanCount.textContent = loanItems.length + '个';
    els.currentMonthPayment.textContent = formatCurrency(totalMonthlyPayment);
    els.nextRepaymentDay.textContent = nextRepaymentDay;
    els.repaymentProgress.textContent = progress.toFixed(2) + '%';

    // Update enhanced stats
    updateEnhancedStats();
}

function updateEnhancedStats() {
    const statsContainer = document.getElementById('enhanced-stats');
    if (!statsContainer) return;

    const filteredLoanItems = loanItems.filter(item => item.loanType === 'loan');
    const filteredCreditItems = loanItems.filter(item => item.loanType === 'credit');
    const filteredPersonalItems = loanItems.filter(item => item.loanType === 'personal');

    // Calculate statistics for each type
    const loanStats = calculateTypeStats(filteredLoanItems);
    const creditStats = calculateTypeStats(filteredCreditItems);
    const personalStats = calculateTypeStats(filteredPersonalItems);
    const totalStats = calculateTypeStats(loanItems);

    const stats = {
        total: totalStats,
        loan: loanStats,
        credit: creditStats,
        personal: personalStats
    };

    const type = currentStatType;
    const data = stats[type] || totalStats;

    statsContainer.innerHTML = `
        <div class="enhanced-stat-card stat-${type}">
            <div class="enhanced-stat-header">
                <span class="enhanced-stat-label">${getStatTypeName(type)}未还款</span>
                <div class="enhanced-stat-icon">${getStatIcon(type)}</div>
            </div>
            <div class="enhanced-stat-value">${formatCurrency(data.remainingAmount)}</div>
            <div class="progress-bar">
                <div class="progress-fill progress-${type}" style="width: ${data.paidPercentage}%"></div>
            </div>
            <div class="enhanced-stat-change ${data.change > 0 ? 'stat-change-positive' : 'stat-change-negative'}">
                ${data.change > 0 ? '+' : ''}${data.change.toFixed(1)}% 较上月
            </div>
        </div>
        <div class="enhanced-stat-card stat-${type}">
            <div class="enhanced-stat-header">
                <span class="enhanced-stat-label">月供/最低还款</span>
                <div class="enhanced-stat-icon">💰</div>
            </div>
            <div class="enhanced-stat-value">${formatCurrency(data.monthlyPayment)}</div>
            <div class="enhanced-stat-change">${type === 'credit' ? '最低还款占比' : '月供压力'}: ${data.monthlyToIncome}%</div>
        </div>
        <div class="enhanced-stat-card stat-${type}">
            <div class="enhanced-stat-header">
                <span class="enhanced-stat-label">项目数量</span>
                <div class="enhanced-stat-icon">📊</div>
            </div>
            <div class="enhanced-stat-value">${data.count}个</div>
            <div class="enhanced-stat-change">${type === 'total' ? '总负债项目' : getStatTypeName(type) + '项目'}</div>
        </div>
        <div class="enhanced-stat-card stat-${type}">
            <div class="enhanced-stat-header">
                <span class="enhanced-stat-label">平均利率</span>
                <div class="enhanced-stat-icon">📈</div>
            </div>
            <div class="enhanced-stat-value">${data.avgRate.toFixed(2)}%</div>
            <div class="enhanced-stat-change">${type === 'credit' ? '日利率转换' : '年化利率'}</div>
        </div>
    `;
}

function calculateTypeStats(items) {
    if (!items || items.length === 0) {
        return {
            totalAmount: 0,
            monthlyPayment: 0,
            count: 0,
            avgRate: 0,
            paidPercentage: 0,
            change: 0,
            monthlyToIncome: 0
        };
    }

    const activeItems = items.filter(item => item.paidPeriods < item.term);
    const totalAmount = items.reduce((sum, item) => sum + item.amount, 0);
    const remainingAmount = items.reduce((sum, item) => sum + item.remainingAmount, 0);
    const monthlyPayment = activeItems.reduce((sum, item) => sum + item.monthlyPayment, 0);
    const totalPaidAmount = items.reduce((sum, item) => sum + item.paidAmount, 0);
    const totalPayment = items.reduce((sum, item) => sum + item.totalPayment, 0);
    const avgRate = items.reduce((sum, item) => sum + item.annualRate, 0) / items.length;

    // Calculate change (simplified - in real app would compare with previous period)
    const change = items.length > 0 ? (Math.random() * 10 - 3) : 0; // Placeholder

    // Monthly payment to income ratio (assuming average income)
    const monthlyToIncome = 8000; // Placeholder income
    const monthlyRatio = monthlyPayment / monthlyToIncome * 100;

    return {
        totalAmount,
        remainingAmount,
        monthlyPayment,
        count: items.length,
        avgRate,
        paidPercentage: totalPayment > 0 ? (totalPaidAmount / totalPayment) * 100 : 0,
        change,
        monthlyToIncome: monthlyRatio
    };
}

function getStatTypeName(type) {
    const names = {
        total: '总负债',
        loan: '银行贷款',
        credit: '信用卡',
        personal: '个人借款'
    };
    return names[type] || '总负债';
}

function getStatIcon(type) {
    const icons = {
        total: '📊',
        loan: '🏦',
        credit: '💳',
        personal: '👥'
    };
    return icons[type] || '📊';
}

function importRecords() {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.csv,.xlsx';

    input.onchange = function(e) {
        const file = e.target.files[0];
        if (!file) return;

        if (file.name.endsWith('.csv')) {
            importCSV(file);
        } else if (file.name.endsWith('.xlsx')) {
            alert('Excel 文件导入需要额外库支持，当前仍以 CSV 为主。');
        }
    };

    input.click();
}

function importCSV(file) {
    const reader = new FileReader();

    reader.onload = function(e) {
        let content = e.target.result;
        if (content.charCodeAt(0) === 0xFEFF) {
            content = content.substring(1);
        }

        const lines = content.split('\n');
        let importedCount = 0;
        let updatedCount = 0;
        let errorCount = 0;

        for (let i = 1; i < lines.length; i++) {
            const line = lines[i].trim();
            if (!line) continue;

            try {
                const values = line.split(',');
                if (values.length < 5) {
                    errorCount++;
                    continue;
                }

                const name = values[0];
                const amount = parseFloat(values[1]);
                const monthlyPayment = parseFloat(values[2]);
                const term = parseInt(values[3], 10);
                const repaymentDay = parseInt(values[4], 10);
                const paidPeriods = values[5] ? parseInt(values[5], 10) : 0;

                if (!name || isNaN(amount) || isNaN(monthlyPayment) || isNaN(term) || isNaN(repaymentDay)) {
                    errorCount++;
                    continue;
                }

                const item = buildLoanItem({
                    loanName: name,
                    loanAmount: amount,
                    monthlyPayment,
                    loanTerm: term,
                    paidPeriods,
                    repaymentDay
                });

                const existingIndex = loanItems.findIndex(loan => loan.name === name);
                if (existingIndex >= 0) {
                    item.id = loanItems[existingIndex].id;
                    item.createdAt = loanItems[existingIndex].createdAt || Date.now();
                    loanItems[existingIndex] = item;
                    updatedCount++;
                } else {
                    loanItems.push(item);
                    importedCount++;
                }
            } catch (error) {
                console.error('导入记录失败:', error);
                errorCount++;
            }
        }

        saveToStorage();
        refreshAllViews();
        alert(`导入完成！\n成功导入: ${importedCount} 条\n更新记录: ${updatedCount} 条\n错误记录: ${errorCount} 条`);
    };

    reader.readAsText(file, 'UTF-8');
}

function exportRecords() {
    let csvContent = '\ufeff贷款项目,贷款金额,月还款额,期限,还款日,已还期数,已还金额,未还金额\n';

    loanItems.forEach(item => {
        csvContent += `${item.name},${item.amount},${item.monthlyPayment},${item.term},${item.repaymentDay},${item.paidPeriods},${item.paidAmount},${item.remainingAmount}\n`;
    });

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute('download', `负债记录_${new Date().toISOString().split('T')[0]}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
}

function applyFilter() {
    const filterType = els.filterType.value;

    if (filterType === 'none') {
        filterCondition = null;
        refreshAllViews();
        return;
    }

    if (filterType === 'single') {
        const singleDate = parseInt(els.singleDate.value, 10);
        if (isNaN(singleDate) || singleDate < 1 || singleDate > 31) {
            alert('请输入有效的日期（1-31）');
            return;
        }

        filterCondition = { type: 'single', date: singleDate };
    } else {
        const startDate = parseInt(els.startDate.value, 10);
        const endDate = parseInt(els.endDate.value, 10);

        if (isNaN(startDate) || isNaN(endDate) || startDate < 1 || startDate > 31 || endDate < 1 || endDate > 31) {
            alert('请输入有效的日期范围（1-31）');
            return;
        }

        if (startDate > endDate) {
            alert('开始日期不能大于结束日期');
            return;
        }

        filterCondition = { type: 'range', startDate, endDate };
    }

    refreshAllViews();
}

function resetFilter() {
    filterCondition = null;
    els.filterType.value = 'none';
    els.singleDate.value = '';
    els.startDate.value = '';
    els.endDate.value = '';
    els.searchKeyword.value = '';
    els.statusFilter.value = 'all';
    els.sortType.value = 'default';
    toggleDateFilterInputs();
    refreshAllViews();
}

function updateFilterResult() {
    const filteredItems = getFilteredItems();
    const paymentTotal = filteredItems.filter(item => item.paidPeriods < item.term).reduce((total, item) => total + item.monthlyPayment, 0);

    els.filteredCount.textContent = filteredItems.length + '个';
    els.dailyPaymentTotal.textContent = formatCurrency(paymentTotal);

    const parts = [];
    if (els.searchKeyword.value.trim()) parts.push(`关键词：${els.searchKeyword.value.trim()}`);
    if (els.statusFilter.value === 'active') parts.push('状态：未结清');
    if (els.statusFilter.value === 'completed') parts.push('状态：已结清');
    if (filterCondition) {
        if (filterCondition.type === 'single') {
            parts.push(`还款日：每月${filterCondition.date}日`);
        } else {
            parts.push(`还款日：每月${filterCondition.startDate}-${filterCondition.endDate}日`);
        }
    }
    if (els.sortType.value !== 'default') parts.push(`排序：${els.sortType.options[els.sortType.selectedIndex].text}`);

    els.filterConditionText.textContent = parts.length ? parts.join(' / ') : '未筛选';
}

function getFilteredItems() {
    let items = [...loanItems];

    const keyword = els.searchKeyword.value.trim().toLowerCase();
    if (keyword) {
        items = items.filter(item => item.name.toLowerCase().includes(keyword));
    }

    // 默认不显示已结清项目
    if (els.statusFilter.value === 'all') {
        items = items.filter(item => item.paidPeriods < item.term);
    } else if (els.statusFilter.value === 'active') {
        items = items.filter(item => item.paidPeriods < item.term);
    } else if (els.statusFilter.value === 'completed') {
        items = items.filter(item => item.paidPeriods >= item.term);
    }

    if (filterCondition) {
        if (filterCondition.type === 'single') {
            items = items.filter(item => item.repaymentDay === filterCondition.date);
        } else {
            items = items.filter(item => item.repaymentDay >= filterCondition.startDate && item.repaymentDay <= filterCondition.endDate);
        }
    }

    items = sortItems(items, els.sortType.value);
    return items;
}

function sortItems(items, sortType) {
    switch (sortType) {
        case 'repaymentDayAsc':
            return items.sort((a, b) => a.repaymentDay - b.repaymentDay);
        case 'monthlyPaymentDesc':
            return items.sort((a, b) => b.monthlyPayment - a.monthlyPayment);
        case 'remainingAmountDesc':
            return items.sort((a, b) => b.remainingAmount - a.remainingAmount);
        case 'annualRateDesc':
            return items.sort((a, b) => b.annualRate - a.annualRate);
        default:
            return items.sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0));
    }
}

function updateLoanList() {
    const filteredItems = getFilteredItems();

    if (filteredItems.length === 0) {
        els.loanList.innerHTML = '<p class="empty-message">暂无符合条件的贷款项目</p>';
        return;
    }

    const tableHTML = buildLoanTable(filteredItems);
    const cardHTML = buildLoanCards(filteredItems);
    els.loanList.innerHTML = `
        <div class="loan-table-wrapper">${tableHTML}</div>
        <div class="loan-card-list">${cardHTML}</div>
    `;
}

function buildLoanTable(items) {
    const rows = items.map(item => `
        <tr class="${item.paidPeriods >= item.term ? 'completed-row' : ''}">
            <td><strong>${escapeHtml(item.name)}</strong><br><span class="status-badge ${item.paidPeriods >= item.term ? 'completed' : 'active'}">${item.paidPeriods >= item.term ? '已结清' : '未结清'}</span></td>
            <td>${formatCurrency(item.amount)}</td>
            <td>${formatCurrency(item.monthlyPayment)}</td>
            <td>${item.term > 0 ? item.term : '-'}</td>
            <td>${item.repaymentDay > 0 ? `每月${item.repaymentDay}日` : '-'}</td>
            <td>${item.annualRate.toFixed(2)}%</td>
            <td>${formatCurrency(item.totalPayment)}</td>
            <td>${formatCurrency(item.totalInterest)}</td>
            <td>${item.term > 0 ? `${item.paidPeriods}/${item.term}` : '-'}</td>
            <td>${formatCurrency(item.paidAmount)}</td>
            <td>${formatCurrency(item.remainingAmount)}</td>
            <td>
                <button class="view-btn" onclick="showLoanDetail(${item.id});">详细</button>
                <button class="edit-btn" onclick="startEditLoan(${item.id});">编辑</button>
                <button class="delete-btn" onclick="deleteLoanItem(${item.id});">删除</button>
            </td>
        </tr>
    `).join('');

    const totalLoanAmount = items.reduce((sum, item) => sum + item.amount, 0);
    const totalMonthlyPayment = items.reduce((sum, item) => sum + item.monthlyPayment, 0);
    const totalTotalPayment = items.reduce((sum, item) => sum + item.totalPayment, 0);
    const totalTotalInterest = items.reduce((sum, item) => sum + item.totalInterest, 0);
    const totalPaidAmount = items.reduce((sum, item) => sum + item.paidAmount, 0);
    const totalRemainingAmount = items.reduce((sum, item) => sum + item.remainingAmount, 0);

    return `
        <table class="loan-table">
            <thead>
                <tr>
                    <th>贷款项目</th>
                    <th>贷款金额</th>
                    <th>月还款额</th>
                    <th>期限</th>
                    <th>还款日</th>
                    <th>年化利率</th>
                    <th>总还款额</th>
                    <th>总利息</th>
                    <th>已还期数</th>
                    <th>已还金额</th>
                    <th>未还金额</th>
                    <th>操作</th>
                </tr>
            </thead>
            <tbody>${rows}</tbody>
            <tfoot>
                <tr>
                    <td><strong>合计</strong></td>
                    <td><strong>${formatCurrency(totalLoanAmount)}</strong></td>
                    <td><strong>${formatCurrency(totalMonthlyPayment)}</strong></td>
                    <td></td>
                    <td></td>
                    <td></td>
                    <td><strong>${formatCurrency(totalTotalPayment)}</strong></td>
                    <td><strong>${formatCurrency(totalTotalInterest)}</strong></td>
                    <td></td>
                    <td><strong>${formatCurrency(totalPaidAmount)}</strong></td>
                    <td><strong>${formatCurrency(totalRemainingAmount)}</strong></td>
                    <td></td>
                </tr>
            </tfoot>
        </table>
    `;
}

function buildLoanCards(items) {
    return items.map(item => `
        <div class="loan-card ${item.paidPeriods >= item.term ? 'completed-row' : ''}">
            <div class="loan-card-header">
                <div>
                    <div class="loan-card-title">${escapeHtml(item.name)}</div>
                    <span class="status-badge ${item.paidPeriods >= item.term ? 'completed' : 'active'}">${item.paidPeriods >= item.term ? '已结清' : '未结清'}</span>
                </div>
                <div class="loan-card-item-value">${formatCurrency(item.remainingAmount)}</div>
            </div>
            <div class="loan-card-grid">
                <div class="loan-card-item"><span class="loan-card-item-label">贷款金额</span><span class="loan-card-item-value">${formatCurrency(item.amount)}</span></div>
                <div class="loan-card-item"><span class="loan-card-item-label">月供</span><span class="loan-card-item-value">${formatCurrency(item.monthlyPayment)}</span></div>
                <div class="loan-card-item"><span class="loan-card-item-label">期限</span><span class="loan-card-item-value">${item.term > 0 ? item.term + '期' : '-'}</span></div>
                <div class="loan-card-item"><span class="loan-card-item-label">还款日</span><span class="loan-card-item-value">${item.repaymentDay > 0 ? '每月' + item.repaymentDay + '日' : '-'}</span></div>
                <div class="loan-card-item"><span class="loan-card-item-label">年化利率</span><span class="loan-card-item-value">${item.annualRate.toFixed(2)}%</span></div>
                <div class="loan-card-item"><span class="loan-card-item-label">已还期数</span><span class="loan-card-item-value">${item.term > 0 ? item.paidPeriods + '/' + item.term : '-'}</span></div>
            </div>
            <div class="loan-card-actions">
                <button class="view-btn" onclick="showLoanDetail(${item.id});">详细</button>
                <button class="edit-btn" onclick="startEditLoan(${item.id});">编辑</button>
                <button class="delete-btn" onclick="deleteLoanItem(${item.id});">删除</button>
            </div>
        </div>
    `).join('');
}

function debouncedRefresh() {
    clearTimeout(refreshTimer);
    refreshTimer = setTimeout(refreshAllViews, 120);
}

function refreshAllViews() {
    updateSummary();
    updateLoanList();
    updateFilterResult();
    updatePersonalLoanList();
    updateCreditCardList();
}

function saveToStorage() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(loanItems));
}

function loadFromStorage() {
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (!raw) return;
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) {
            loanItems = parsed;
        }
    } catch (error) {
        console.error('读取本地数据失败:', error);
    }
    updatePersonalLoanList();
    updateCreditCardList();
}

function formatCurrency(value, raw = false) {
    if (raw) return Number(value || 0).toFixed(2);
    return Number(value || 0).toFixed(2) + '元';
}

function updateCreditUsedPercentage() {
    const creditUsed = parseFloat(document.getElementById('credit-used').value) || 0;
    const creditLimit = parseFloat(document.getElementById('credit-limit').value) || 0;
    const percentage = creditLimit > 0 ? (creditUsed / creditLimit) * 100 : 0;

    const hint = document.querySelector('#credit-card-fields .input-hint');
    if (hint) {
        hint.textContent = `已用额度: ${percentage.toFixed(1)}% ${percentage > 80 ? '(⚠️ 高额度使用)' : ''}`;
        hint.style.color = percentage > 80 ? 'var(--danger)' : 'var(--text-soft)';
    }
}

function calculateAmountHint() {
    const amount = parseFloat(els.loanAmount.value) || 0;
    const loanType = document.querySelector('.loan-type-option.selected')?.dataset.type;
    const hint = document.getElementById('amount-hint');

    if (hint && loanType === 'credit') {
        hint.textContent = `建议额度使用率保持在80%以下${amount > 0 ? ` (当前假设额度: ${(amount / 0.8).toFixed(0)}元)` : ''}`;
    } else if (hint) {
        hint.textContent = '请输入总借款金额';
    }
}

function calculatePaymentHint() {
    const payment = parseFloat(els.monthlyPayment.value) || 0;
    const loanType = document.querySelector('.loan-type-option.selected')?.dataset.type;

    if (loanType === 'credit') {
        els.monthlyPayment.setAttribute('placeholder', '建议至少最低还款额');
    }
}

function validateAmount() {
    const amount = parseFloat(els.loanAmount.value) || 0;
    const loanType = document.querySelector('.loan-type-option.selected')?.dataset.type;

    if (loanType === 'credit') {
        const creditLimit = parseFloat(document.getElementById('credit-limit').value) || 0;
        if (amount > creditLimit) {
            alert('欠款金额不能超过信用额度');
            els.loanAmount.value = creditLimit;
        }
    }
}

function validatePayment() {
    const payment = parseFloat(els.monthlyPayment.value) || 0;
    const loanType = document.querySelector('.loan-type-option.selected')?.dataset.type;

    if (loanType === 'credit') {
        const minPayment = parseFloat(document.getElementById('min-payment').value) || 0;
        if (payment > 0 && minPayment > 0 && payment < minPayment) {
            alert('月还款金额不能低于最低还款额');
            els.monthlyPayment.value = minPayment;
        }
    }
}

function escapeHtml(value) {
    return String(value)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

// 回到顶部按钮功能
document.addEventListener('DOMContentLoaded', function() {
    const backToTopButton = document.getElementById('back-to-top');
    if (!backToTopButton) return;

    // 点击回到顶部
    backToTopButton.addEventListener('click', function() {
        window.scrollTo({
            top: 0,
            behavior: 'smooth'
        });
    });
});
