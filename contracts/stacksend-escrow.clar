;; StackSend Escrow Contract
;; A peer-to-peer remittance smart contract with group contribution support
;; Built with Clarity 4 for Stacks blockchain

;; Constants
(define-constant contract-owner tx-sender)
(define-constant err-owner-only (err u100))
(define-constant err-not-found (err u101))
(define-constant err-unauthorized (err u102))
(define-constant err-invalid-amount (err u103))
(define-constant err-invalid-deadline (err u104))
(define-constant err-target-not-reached (err u105))
(define-constant err-already-released (err u106))
(define-constant err-deadline-passed (err u107))
(define-constant err-invalid-status (err u108))

;; Platform fee: 0.5% (50 basis points out of 10000)
(define-constant platform-fee-bps u50)
(define-constant basis-points u10000)

;; Data Variables
(define-data-var remittance-nonce uint u0)
(define-data-var contract-paused bool false)

;; Data Maps
;; Remittance structure
(define-map remittances
  { remittance-id: uint }
  {
    creator: principal,
    recipient: principal,
    target-amount: uint,
    total-raised: uint,
    deadline: uint,
    description: (string-ascii 500),
    status: (string-ascii 20),
    created-at: uint,
    released-at: (optional uint),
    currency-pair: (string-ascii 10)
  }
)

;; Contribution tracking
(define-map contributions
  { remittance-id: uint, contributor: principal }
  {
    amount: uint,
    contributed-at: uint
  }
)

;; Placeholder for future implementation
;; This contract will be developed across Days 3-8 as per PROJECT_PLAN.md

;; Read-only functions
(define-read-only (get-contract-owner)
  contract-owner
)

(define-read-only (is-paused)
  (var-get contract-paused)
)

;; This is a placeholder contract
;; Full implementation coming in subsequent issues
