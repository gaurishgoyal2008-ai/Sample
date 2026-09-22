/**
 * APEX TITAN FITNESS & PERFORMANCE
 * Core Application Engine & Interactivity
 */

document.addEventListener('DOMContentLoaded', () => {
  initMobileMenu();
  initBillingToggle();
  initMacroCalculator();
  initDietTabs();
  initTimetableFilters();
  initPassModal();
  initContactForm();
  initFaqAccordion();
  initGoogleAuth();
});

/* ==========================================================================
   TOAST NOTIFICATION SYSTEM
   ========================================================================== */
function showToast(message, icon = '✓') {
  let container = document.querySelector('.toast-container');
  if (!container) {
    container = document.createElement('div');
    container.className = 'toast-container';
    document.body.appendChild(container);
  }

  const toast = document.createElement('div');
  toast.className = 'toast';
  toast.innerHTML = `<span style="color: var(--accent-lime); font-size: 1.2rem; font-weight: bold;">${icon}</span> <span>${message}</span>`;
  container.appendChild(toast);

  // Trigger animation
  requestAnimationFrame(() => {
    toast.classList.add('show');
  });

  setTimeout(() => {
    toast.classList.remove('show');
    setTimeout(() => toast.remove(), 400);
  }, 4000);
}

/* ==========================================================================
   MOBILE MENU DRAWER
   ========================================================================== */
function initMobileMenu() {
  const toggleBtn = document.querySelector('.mobile-toggle');
  const drawer = document.querySelector('.mobile-nav-drawer');
  const drawerLinks = document.querySelectorAll('.mobile-nav-drawer a');

  if (!toggleBtn || !drawer) return;

  toggleBtn.addEventListener('click', () => {
    drawer.classList.toggle('active');
    const isOpen = drawer.classList.contains('active');
    toggleBtn.innerHTML = isOpen ? '✕' : '☰';
  });

  drawerLinks.forEach(link => {
    link.addEventListener('click', () => {
      drawer.classList.remove('active');
      toggleBtn.innerHTML = '☰';
    });
  });
}

/* ==========================================================================
   BILLING SWITCH (MONTHLY / ANNUAL)
   ========================================================================== */
function initBillingToggle() {
  const toggleSwitch = document.querySelector('.billing-switch');
  const priceElements = document.querySelectorAll('.price-amount');
  const periodElements = document.querySelectorAll('.price-period');

  if (!toggleSwitch || priceElements.length === 0) return;

  let isAnnual = false;
  const rates = {
    monthly: [49, 89, 149],
    annual: [39, 69, 119] // ~25% off
  };

  toggleSwitch.addEventListener('click', () => {
    isAnnual = !isAnnual;
    toggleSwitch.classList.toggle('annual', isAnnual);

    priceElements.forEach((el, index) => {
      const targetVal = isAnnual ? rates.annual[index] : rates.monthly[index];
      animateValue(el, parseInt(el.textContent), targetVal, 400);
    });

    periodElements.forEach(el => {
      el.textContent = isAnnual ? '/ month (billed annually)' : '/ month';
    });

    showToast(isAnnual ? 'Annual discount applied (Save 25%)' : 'Switched to monthly billing');
  });
}

function animateValue(obj, start, end, duration) {
  let startTimestamp = null;
  const step = (timestamp) => {
    if (!startTimestamp) startTimestamp = timestamp;
    const progress = Math.min((timestamp - startTimestamp) / duration, 1);
    obj.innerHTML = Math.floor(progress * (end - start) + start);
    if (progress < 1) {
      window.requestAnimationFrame(step);
    }
  };
  window.requestAnimationFrame(step);
}

/* ==========================================================================
   MACRO & CALORIE CALCULATOR
   ========================================================================== */
function initMacroCalculator() {
  const calcForm = document.getElementById('macroCalculatorForm');
  if (!calcForm) return;

  const weightInput = document.getElementById('calcWeight');
  const heightInput = document.getElementById('calcHeight');
  const ageInput = document.getElementById('calcAge');
  const genderInput = document.getElementById('calcGender');
  const activityInput = document.getElementById('calcActivity');

  // Outputs
  const calorieDisplay = document.getElementById('caloriesResult');
  const proteinVal = document.getElementById('proteinVal');
  const proteinFill = document.getElementById('proteinFill');
  const carbsVal = document.getElementById('carbsVal');
  const carbsFill = document.getElementById('carbsFill');
  const fatsVal = document.getElementById('fatsVal');
  const fatsFill = document.getElementById('fatsFill');
  const waterTarget = document.getElementById('waterTarget');

  function calculateMacros() {
    const weight = parseFloat(weightInput.value) || 75; // kg
    const height = parseFloat(heightInput.value) || 178; // cm
    const age = parseFloat(ageInput.value) || 28;
    const gender = genderInput.value;
    const activity = parseFloat(activityInput.value) || 1.55;
    const selectedGoal = document.querySelector('input[name="fitnessGoal"]:checked')?.value || 'shred';

    // Mifflin-St Jeor BMR
    let bmr = (10 * weight) + (6.25 * height) - (5 * age);
    bmr += (gender === 'male' ? 5 : -161);

    const tdee = Math.round(bmr * activity);
    let targetCalories = tdee;
    let proteinGrams = 0;
    let fatsGrams = 0;
    let carbsGrams = 0;

    switch (selectedGoal) {
      case 'shred':
        targetCalories = Math.round(tdee * 0.80); // 20% deficit
        proteinGrams = Math.round(weight * 2.2); // 2.2g per kg
        fatsGrams = Math.round((targetCalories * 0.25) / 9);
        carbsGrams = Math.max(20, Math.round((targetCalories - (proteinGrams * 4) - (fatsGrams * 9)) / 4));
        break;

      case 'muscle':
        targetCalories = Math.round(tdee * 1.15); // 15% surplus
        proteinGrams = Math.round(weight * 2.0);
        fatsGrams = Math.round((targetCalories * 0.25) / 9);
        carbsGrams = Math.round((targetCalories - (proteinGrams * 4) - (fatsGrams * 9)) / 4);
        break;

      case 'endurance':
        targetCalories = tdee;
        proteinGrams = Math.round(weight * 1.8);
        fatsGrams = Math.round((targetCalories * 0.20) / 9);
        carbsGrams = Math.round((targetCalories - (proteinGrams * 4) - (fatsGrams * 9)) / 4);
        break;

      case 'keto':
        targetCalories = Math.round(tdee * 0.85);
        proteinGrams = Math.round(weight * 1.9);
        carbsGrams = 30; // strict low carb
        fatsGrams = Math.round((targetCalories - (proteinGrams * 4) - (carbsGrams * 4)) / 9);
        break;
    }

    // Hydration calculation: 35ml per kg + 500ml for training
    const waterLiters = ((weight * 0.035) + 0.6).toFixed(1);

    // Update UI
    if (calorieDisplay) {
      calorieDisplay.textContent = targetCalories.toLocaleString();
    }
    if (proteinVal) {
      proteinVal.textContent = `${proteinGrams}g`;
      const pPercent = Math.min(100, Math.round((proteinGrams * 4 / targetCalories) * 100));
      proteinFill.style.width = `${pPercent}%`;
    }
    if (carbsVal) {
      carbsVal.textContent = `${carbsGrams}g`;
      const cPercent = Math.min(100, Math.round((carbsGrams * 4 / targetCalories) * 100));
      carbsFill.style.width = `${cPercent}%`;
    }
    if (fatsVal) {
      fatsVal.textContent = `${fatsGrams}g`;
      const fPercent = Math.min(100, Math.round((fatsGrams * 9 / targetCalories) * 100));
      fatsFill.style.width = `${fPercent}%`;
    }
    if (waterTarget) {
      waterTarget.textContent = `${waterLiters} Liters / Day`;
    }
  }

  // Listeners
  [weightInput, heightInput, ageInput, genderInput, activityInput].forEach(inp => {
    if (inp) {
      inp.addEventListener('input', calculateMacros);
      inp.addEventListener('change', calculateMacros);
    }
  });

  const goalRadios = document.querySelectorAll('input[name="fitnessGoal"]');
  goalRadios.forEach(radio => {
    radio.addEventListener('change', () => {
      calculateMacros();
      showToast(`Recalibrated for: ${radio.parentElement.querySelector('.goal-title').textContent}`);
    });
  });

  // Initial run
  calculateMacros();
}

/* ==========================================================================
   DIET TABS CONTROLLER
   ========================================================================== */
function initDietTabs() {
  const tabs = document.querySelectorAll('.diet-tab-btn');
  const protocolPanels = document.querySelectorAll('.diet-protocol-panel');

  if (tabs.length === 0) return;

  tabs.forEach(tab => {
    tab.addEventListener('click', () => {
      tabs.forEach(t => t.classList.remove('active'));
      tab.classList.add('active');

      const targetId = tab.dataset.target;
      protocolPanels.forEach(panel => {
        if (panel.id === targetId) {
          panel.style.display = 'block';
        } else {
          panel.style.display = 'none';
        }
      });
    });
  });
}

/* ==========================================================================
   CLASS TIMETABLE FILTERS
   ========================================================================== */
function initTimetableFilters() {
  const filterBtns = document.querySelectorAll('.day-filter-btn');
  const classCards = document.querySelectorAll('.class-card');

  if (filterBtns.length === 0) return;

  filterBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      filterBtns.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');

      const day = btn.dataset.day;
      classCards.forEach(card => {
        if (day === 'all' || card.dataset.days.includes(day)) {
          card.style.display = 'flex';
        } else {
          card.style.display = 'none';
        }
      });
    });
  });
}

/* ==========================================================================
   VIP DAY PASS MODAL & GENERATOR
   ========================================================================== */
function initPassModal() {
  const openButtons = document.querySelectorAll('.trigger-pass-modal');
  const modal = document.getElementById('passModal');
  const closeBtn = document.querySelector('.close-modal-btn');
  const passContainer = document.getElementById('vipPassForm');
  const passForm = document.getElementById('passFormElement') || passContainer;
  const passTicketView = document.getElementById('passTicketView');

  openButtons.forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      if (modal) {
        modal.classList.add('active');
      } else {
        window.location.href = 'index.html';
      }
    });
  });

  if (closeBtn && modal) {
    closeBtn.addEventListener('click', () => {
      modal.classList.remove('active');
    });
  }

  if (modal) {
    modal.addEventListener('click', (e) => {
      if (e.target === modal) {
        modal.classList.remove('active');
      }
    });
  }

  if (passForm) {
    passForm.addEventListener('submit', (e) => {
      e.preventDefault();
      const guestNameInput = document.getElementById('guestName');
      const guestName = guestNameInput && guestNameInput.value ? guestNameInput.value : 'Apex Athlete';
      const guestPassId = 'APX-' + Math.floor(100000 + Math.random() * 900000);

      // Populate ticket view
      const nameDisplay = document.getElementById('ticketHolderName');
      const idDisplay = document.getElementById('ticketIdDisplay');
      const dateDisplay = document.getElementById('ticketValidDate');

      if (nameDisplay) nameDisplay.textContent = guestName;
      if (idDisplay) idDisplay.textContent = guestPassId;
      const validUntil = new Date();
      validUntil.setDate(validUntil.getDate() + 7);
      if (dateDisplay) {
        dateDisplay.textContent = validUntil.toLocaleDateString('en-US', {
          month: 'short',
          day: 'numeric',
          year: 'numeric'
        });
      }

      // Switch view
      if (passContainer) passContainer.style.display = 'none';
      if (passTicketView) passTicketView.style.display = 'block';

      showToast(`Pass Generated for ${guestName}! Valid for 7 days.`);
    });
  }

  const printBtn = document.getElementById('printPassBtn');
  if (printBtn) {
    printBtn.addEventListener('click', () => {
      window.print();
    });
  }
}

/* ==========================================================================
   CONTACT PAGE FORM
   ========================================================================== */
function initContactForm() {
  const contactForm = document.getElementById('gymContactForm');
  if (!contactForm) return;

  contactForm.addEventListener('submit', (e) => {
    e.preventDefault();

    const name = document.getElementById('contactName')?.value;
    const reason = document.getElementById('contactReason')?.value || 'Inquiry';

    const submitBtn = contactForm.querySelector('button[type="submit"]');
    const originalText = submitBtn.innerHTML;

    submitBtn.innerHTML = 'Transmitting... ⚡';
    submitBtn.disabled = true;

    setTimeout(() => {
      submitBtn.innerHTML = 'Inquiry Confirmed! ✓';
      submitBtn.style.backgroundColor = 'var(--accent-lime)';
      submitBtn.style.color = '#07090E';

      showToast(`Thank you, ${name}! Your request has been confirmed. Our performance coach will contact you within 2 hours.`, '⚡');

      setTimeout(() => {
        contactForm.reset();
        submitBtn.innerHTML = originalText;
        submitBtn.disabled = false;
        submitBtn.style.backgroundColor = '';
        submitBtn.style.color = '';
      }, 3500);
    }, 1000);
  });
}

/* ==========================================================================
   FAQ ACCORDION
   ========================================================================== */
function initFaqAccordion() {
  const faqItems = document.querySelectorAll('.faq-accordion-item');
  if (faqItems.length === 0) return;

  faqItems.forEach(item => {
    const trigger = item.querySelector('.faq-question');
    trigger.addEventListener('click', () => {
      const isOpen = item.classList.contains('active');

      // Close other items
      faqItems.forEach(other => {
        other.classList.remove('active');
        const ans = other.querySelector('.faq-answer');
        if (ans) ans.style.maxHeight = null;
      });

      if (!isOpen) {
        item.classList.add('active');
        const ans = item.querySelector('.faq-answer');
        if (ans) ans.style.maxHeight = ans.scrollHeight + 'px';
      }
    });
  });
}
/* ==========================================================================
   SUPABASE GOOGLE AUTHENTICATION
   ========================================================================== */

function initGoogleAuth() {
  const googleLoginBtn = document.getElementById('googleLoginBtn');
  const logoutBtn = document.getElementById('logoutBtn');
  const userProfile = document.getElementById('userProfile');
  const userAvatar = document.getElementById('userAvatar');
  const userName = document.getElementById('userName');

  // Google Login
  if (googleLoginBtn) {
    googleLoginBtn.addEventListener('click', async () => {
      const { error } = await supabaseClient.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: window.location.origin
        }
      });

      if (error) {
        console.error('Google login error:', error);
        showToast('Google login failed.', '✕');
      }
    });
  }

  // Logout
  if (logoutBtn) {
    logoutBtn.addEventListener('click', async () => {
      const { error } = await supabaseClient.auth.signOut();

      if (error) {
        console.error('Logout error:', error);
        showToast('Logout failed.', '✕');
        return;
      }

      updateAuthUI(null);
      showToast('Logged out successfully.');
    });
  }

  // Check whether the user is already logged in
  supabaseClient.auth.getSession().then(({ data }) => {
    updateAuthUI(data.session);
  });

  // Detect login/logout changes
  supabaseClient.auth.onAuthStateChange((event, session) => {
    updateAuthUI(session);
  });


  function updateAuthUI(session) {
    if (session && session.user) {
      const user = session.user;

      const name =
        user.user_metadata?.full_name ||
        user.user_metadata?.name ||
        user.email ||
        'Member';

      const avatar =
        user.user_metadata?.avatar_url ||
        user.user_metadata?.picture ||
        '';

      if (userName) {
        userName.textContent = name;
      }

      if (userAvatar) {
        if (avatar) {
          userAvatar.src = avatar;
          userAvatar.style.display = 'block';
        } else {
          userAvatar.style.display = 'none';
        }
      }

      if (googleLoginBtn) {
        googleLoginBtn.style.display = 'none';
      }

      if (userProfile) {
        userProfile.style.display = 'flex';
      }

    } else {

      if (googleLoginBtn) {
        googleLoginBtn.style.display = 'inline-flex';
      }

      if (userProfile) {
        userProfile.style.display = 'none';
      }
    }
  }
}
