# CaseTrack --- Project Overview

> **Document ID:** 00\
> **Document status:** Initial planning baseline\
> **Version:** 1.0\
> **Last updated:** 2026-10-17\
> **Project phase:** Planning and requirements definition\
> **Current user scope:** Single user\
> **Primary user:** Parvi Officer, Old Subzi Mandi Police Station,
> Rohtak, Haryana

------------------------------------------------------------------------

## 1. Purpose of This Document

This document records the confirmed purpose, operational context,
current scope, technology baseline, constraints, and long-term direction
of CaseTrack.

It is a planning reference, not a declaration that every listed
capability has already been implemented or verified.

Only confirmed information is recorded as established project context.
Pending decisions and unverified implementation details are listed
separately.

## 2. Project Overview

CaseTrack is a web-based case and record management system being planned
to support the daily work of a Parvi Officer.

The immediate objective is to make the user's daily workflow easier and
more reliable by organizing FIR information, related court proceedings,
hearing dates, physical file tracking, and associated records in one
digital system.

The long-term direction is to establish a foundation that can later be
expanded to support other police stations and administrative users
across Haryana.

## 3. Project Objectives

### 3.1 Current objective

-   Make the user's daily record-management work easier and more
    organized.
-   Digitally manage relevant FIR and court-related information.
-   Support the tracking of physical files and their movements.
-   Improve the ability to find and retrieve records.
-   Maintain accurate and consistent information.

### 3.2 Long-term direction

The intended expansion path is:

1.  Current single-user workflow.
2.  Other Parvi Officers and police stations in Rohtak.
3.  SP Office administrative capabilities.
4.  Multiple districts in Haryana.
5.  Potential state-wide use across Haryana.

These are future directions; specific release dates and implementation
commitments have not been established.

## 4. Primary User and Operational Context

### 4.1 Primary user

-   **Role:** Parvi Officer
-   **Police station:** Old Subzi Mandi Police Station, Rohtak, Haryana
-   **Current application scope:** The user's own workflow

### 4.2 Current responsibilities

The user's work includes:

-   Managing under-trial court files.
-   Taking relevant files to court on their hearing dates and bringing
    them back to the police station.
-   Updating and managing next hearing dates.
-   Organizing physical files according to their next hearing dates.
-   Recording relevant extra notes.
-   Tracking files taken by Investigating Officers (IOs).
-   Maintaining a year-wise master FIR register.
-   Maintaining PO and disposed-case registers.
-   Providing FIR-specific or special-case information to other police
    officers when requested.

## 5. Existing Recordkeeping Workflow

The current workflow uses multiple physical registers.

  -----------------------------------------------------------------------
  Register                            Confirmed purpose
  ----------------------------------- -----------------------------------
  FIR Register                        Year-wise master register
                                      containing FIR details and basic
                                      information about related matters,
                                      including court cases, PO, disposed
                                      cases, and UCR-related information.

  Register Diary                      Daily operational register
                                      containing hearing dates,
                                      judge-wise entries, extra notes,
                                      and information about files taken
                                      by IOs.

  PO Register                         Register used to manage relevant
                                      court cases in which an accused is
                                      declared a proclaimed offender.

  Disposed Register                   Month-wise register used to manage
                                      disposed under-trial cases.
  -----------------------------------------------------------------------

### 5.1 Register Diary

The Register Diary is used for day-to-day work. It includes next hearing
dates and judge-wise entries. Extra notes may record matters such as
bail, superdari, NBW, or a file being taken by an IO.

When a hearing date becomes the current date, the user checks the court
information, records the subsequent date, and organizes the physical
file according to its next date.

### 5.2 File movement records

When a file is taken away from the user's custody, the Register Diary's
extra notes may record the file number, who took it, when it was taken,
and why it was taken.

A separate page is also used for files that are not currently with the
user. It records file movements, including who took a file, the date it
went out, when it returned, and subsequent movements.

## 6. Core Terminology and Record Relationships

CaseTrack must distinguish between an FIR master record, a court
proceeding, and a physical file.

### 6.1 FIR Master

The FIR Master is the primary record for an FIR. It contains the main
FIR information and basic details of related matters.

### 6.2 FIR identification

The FIR is identified using details including:

-   FIR Number
-   FIR Year
-   Police Station

FIR Date and Under Section are also part of the main FIR information.

An FIR number alone is not sufficient to identify an FIR across
different police stations and years.

### 6.3 File Number

The File Number is the physical file identifier derived from the FIR
number and the last two digits of the FIR year.

Example:

-   FIR Number: `23`
-   FIR Year: `2025`
-   File Number: `23/25`

The File Number is not the same as a court case registration number.

### 6.4 Court proceedings and physical files

One FIR may be related to multiple court proceedings, such as
proceedings in a Lower Court, Sessions Court, or Juvenile Justice Board
(JJB).

Each proceeding has its own court registration number and court
identification. A separate physical court file may exist for each
proceeding. These physical files may share the same File Number while
being distinguishable by their court type and court registration number.

The intended conceptual relationship is:

**One FIR Master → Multiple Court Proceedings → Associated Physical
Court Files**

This describes the confirmed operational relationship. The exact
database schema and technical constraints remain to be designed.

## 7. File Tracking Requirements

CaseTrack is intended to support both current-location visibility and
historical movement tracking for each physical court file.

### 7.1 Current location

The user should be able to see the current known location of a physical
file.

### 7.2 Movement history

The movement history should retain details such as:

-   Which physical file moved.
-   Who took or received it.
-   When it moved.
-   The purpose of the movement.
-   When it was returned.
-   Details of later movements.

A new movement must not replace the history of previous movements.

### 7.3 Storage

File movement history is required to be stored in Firestore. The offline
and recovery design for these records remains to be determined.

## 8. Current Functional Scope

The initial scope is limited to capabilities relevant to the user's
Parvi Officer workflow.

The current planned scope includes:

-   FIR Master Register.
-   Related court proceedings.
-   Register Diary and hearing-date management.
-   Physical file tracking and movement history.
-   PO Register.
-   Disposed Register.
-   Basic UCR information.
-   Dashboard, search, and reports relevant to the user's work.
-   Authentication and authorized access.
-   Offline reading and writing, with synchronization.
-   Data recovery and an independent backup mechanism.

This list records planned scope; it does not confirm that every
capability is implemented or tested.

### 8.1 Basic UCR information

Detailed UCR management is not part of the current scope. The current
plan is to maintain only selected UCR information in the master FIR
record, including:

-   UCR Number or Registration Number.
-   UCR Type.
-   Disposal Date.

Additional UCR fields may be considered later.

## 9. Technology Baseline

The existing technology stack is the current planning baseline.

  Component          Current baseline
  ------------------ -------------------------
  Frontend           HTML, CSS, JavaScript
  Database           Firebase Firestore
  Authentication     Firebase Authentication
  Build tool         Vite
  Deployment setup   GitHub Pages
  Version control    Git and GitHub

The current decision is to continue with this stack unless a future
requirement demonstrates a need to evaluate alternatives.

This baseline does not, by itself, verify that the current deployment or
security configuration is suitable for every future use case.

## 10. Offline Operation and Synchronization

Offline capability is a confirmed requirement.

The intended capabilities are:

-   Read locally available records without an internet connection.
-   Create and update records while offline.
-   Synchronize local changes with Firestore when connectivity returns.

The technical approach has not yet been selected. Planning must address
synchronization conflicts, duplicate writes, failed sync attempts, local
persistence, and synchronization status.

## 11. Data Reliability, Security, and Recovery

The following are confirmed project requirements:

### 11.1 Accuracy and integrity

FIR and court proceeding records should be accurately maintained. The
system should reduce avoidable duplicate records and incorrect
relationships.

### 11.2 Operational consistency

Hearing-date information, Register Diary records, and physical file
locations should remain consistent.

### 11.3 Historical traceability

Relevant record changes and physical file movements should retain their
history.

### 11.4 Recovery and backup

The system should support retrieving records from Firestore if local
data is lost. A separate backup mechanism should also be planned to
support recovery from accidental deletion or data corruption.

### 11.5 Access control

Only authorized users should be able to access or modify records. Future
multi-station support must include rules that control which users can
access which police station's data.

Detailed security controls and implementation readiness have not yet
been verified in this document.

## 12. Operating Constraints

### 12.1 Digital-first workflow

CaseTrack is intended to support a digital-first workflow. Physical
registers will continue to be maintained according to applicable
departmental requirements and operational needs.

This document does not assume that CaseTrack can replace any officially
required physical register.

### 12.2 Initial scope boundary

The initial version will focus on the user's current responsibilities.
Other police functions and broader administrative workflows are outside
the initial scope unless separately approved.

### 12.3 Connectivity

The system is expected to remain useful when internet connectivity is
unavailable, subject to the final offline design.

### 12.4 Sensitive official information

The system will handle sensitive official records. Confidentiality,
access control, data integrity, and secure storage must be considered
throughout planning and development.

## 13. Future Expansion

The following are future directions, not current-user requirements:

-   Separate accounts for Parvi Officers at other police stations in
    Rohtak.
-   SP Office administration.
-   Multi-district support across Haryana.
-   Potential state-wide use.

Future expansion will require separate decisions about user roles,
permissions, station-level data isolation, administration, and security.

The Admin Panel role and access boundaries confirmed for future planning
are recorded in
[`20-Admin-Panel-Architecture-Decisions.md`](./20-Admin-Panel-Architecture-Decisions.md).
Those decisions do not change the current single-user scope or verify an
implementation.

## 14. Out of Scope for the Initial Version

The following are not part of the current initial scope:

-   Detailed UCR management.
-   Deployment to multiple police stations.
-   SP Office administrative workflows.
-   District-level administration.
-   State-level administration.
-   Police functions unrelated to the user's immediate responsibilities.

## 15. Pending Questions and Unverified Information

The following items are not settled by this overview and must not be
treated as confirmed implementation details.

### 15.1 Functional rules

-   Exact rules for generating and validating FIR and File identifiers.
-   Detailed rules for creating, linking, transferring, or closing court
    proceedings.
-   Complete hearing-date and trial-stage rules.
-   Final list of physical file location categories.
-   Which file movement fields are mandatory.
-   Detailed PO and disposed-case business rules.
-   Search, dashboard, and report requirements.

### 15.2 Technical design

-   Final Firestore schema and relationship constraints.
-   Local storage technology for offline operation.
-   Synchronization strategy and conflict-resolution policy.
-   Duplicate-write prevention and retry behavior.
-   Backup frequency, retention period, and restoration procedure.
-   Data migration and recovery procedures.
-   SP/Senior Officer role identifier, jurisdiction representation, and
    secure aggregate-report mechanism; see
    `20-Admin-Panel-Architecture-Decisions.md` for the confirmed access
    boundary. Other future permission details remain to be specified.

### 15.3 Security and operational verification

-   Current Firestore Security Rules and authorization behavior have not
    been verified by this document.
-   Production readiness of authentication, authorization, and local
    data protection has not been established here.
-   Suitability of the current deployment setup for future multi-user
    and multi-station use requires separate evaluation.
-   Applicable departmental requirements for physical and digital
    records must be verified before changing existing recordkeeping
    obligations.

## 16. Project Principles

The project will be planned and developed around these principles:

1.  Accurate official records.
2.  Clear separation of FIRs, court proceedings, and physical files.
3.  Current-location visibility and historical file movement tracking.
4.  Consistency between hearing information and related records.
5.  Secure, authorized access.
6.  Offline usability with controlled synchronization.
7.  Reliable backup and recovery.
8.  Maintainable and appropriately scoped architecture.
9.  Practical usability for daily police work.
10. Respect for applicable departmental recordkeeping requirements.
11. Incremental planning, implementation, and verification.
12. Future scalability without unnecessary complexity in the initial
    version.

## 17. Document Maintenance

Update this document when a material project-level decision changes,
including:

-   Project objective or scope.
-   Target users.
-   Technology baseline.
-   Major operating constraints.
-   Long-term expansion direction.

Detailed functional rules, technical architecture, security design, and
implementation status should be maintained in separate documents. When
updating this overview, distinguish confirmed decisions from proposals
and unresolved questions.

------------------------------------------------------------------------

**End of document**
